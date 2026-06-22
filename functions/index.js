const { setGlobalOptions } = require('firebase-functions')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const logger = require('firebase-functions/logger')

setGlobalOptions({ maxInstances: 10, region: 'europe-west1' })

admin.initializeApp()
const db = admin.firestore()

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalizza qualsiasi tipo di risposta in stringa leggibile
function displayValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    // radio/dropdown con openText: { value, openTextValue? }
    if ('value' in value) {
      const base = String(value.value ?? '')
      return value.openTextValue ? `${base} (${value.openTextValue})` : base
    }
    // checkbox con openText: { selected, openTexts? }
    if ('selected' in value) {
      const parts = (value.selected ?? []).map(v => {
        const extra = value.openTexts?.[v]
        return extra ? `${v} (${extra})` : v
      })
      return parts.join(', ')
    }
    // survey: { rowId: colValue, ... }
    return Object.values(value).join(', ')
  }
  return String(value)
}

function fillTemplate(template, labels, answers, meta = {}) {
  let out = template
  for (const [key, value] of Object.entries(meta)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ''))
  }
  for (const [fieldId, value] of Object.entries(answers)) {
    const label = labels[fieldId] || fieldId
    const display = displayValue(value)
    out = out.replaceAll(`{{${fieldId}}}`, display)
    out = out.replaceAll(`{{${label}}}`, display)
  }
  return out
}

function buildAutoTable(labels, answers) {
  const rows = Object.entries(answers)
    .map(([fieldId, value]) => {
      const label = labels[fieldId] || fieldId
      const display = displayValue(value)
      return `<tr><td style="padding:6px 12px;font-weight:600;color:#002068;border-bottom:1px solid #e8e7f0">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #e8e7f0">${display}</td></tr>`
    })
    .join('')
  return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">${rows}</table>`
}

// Email HTML standard per notifica all'organizzatore
function buildOrganizerEmail(formTitle, formId, responseId, labels, answers, appUrl) {
  const table = buildAutoTable(labels, answers)
  const responseUrl = `${appUrl}/responses/${formId}`
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1b22">
  <div style="background:#002068;padding:24px 28px;border-radius:12px 12px 0 0">
    <p style="color:#8aa4ff;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 6px">SOLIDANDO · NUOVA RISPOSTA</p>
    <h1 style="color:#ffffff;font-size:20px;margin:0">${formTitle}</h1>
  </div>
  <div style="background:#ffffff;padding:24px 28px;border:1px solid #e8e7f0;border-top:none">
    <p style="color:#444653;margin:0 0 16px">È arrivata una nuova compilazione. Di seguito i dettagli:</p>
    ${table}
    <div style="margin-top:20px;padding:12px 16px;background:#f4f3fc;border-radius:8px;font-size:12px;color:#747684">
      ID risposta: <span style="font-family:monospace">${responseId}</span>
    </div>
    <a href="${responseUrl}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#002068;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Visualizza risposta →</a>
  </div>
  <div style="padding:16px 28px;text-align:center">
    <p style="color:#c4c5d5;font-size:11px;margin:0">Powered by Solidando</p>
  </div>
</div>`
}

function createTransporter(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
  })
}

// ─── Push + in-app notification helper ───────────────────────────────────────

/**
 * Create an in-app notification document and optionally send FCM push to the user.
 */
async function createNotification({ uid, title, body, threadId, threadType, url }) {
  const notifRef = db.collection('notifications').doc()
  await notifRef.set({
    uid,
    title,
    body,
    threadId: threadId ?? null,
    threadType: threadType ?? null,
    url: url ?? null,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // Send FCM push to all registered tokens for this user
  try {
    const userSnap = await db.doc(`users/${uid}`).get()
    const tokens = userSnap.exists ? Object.keys(userSnap.data().fcmTokens ?? {}) : []
    if (tokens.length === 0) return

    const message = {
      notification: { title, body },
      data: { url: url ?? '/', threadId: threadId ?? '', threadType: threadType ?? '' },
      tokens,
    }
    const res = await admin.messaging().sendEachForMulticast(message)

    // Remove stale tokens
    const staleTokens = []
    res.responses.forEach((r, i) => {
      if (!r.success && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token')) {
        staleTokens.push(tokens[i])
      }
    })
    if (staleTokens.length > 0) {
      const tokenUpdates = {}
      for (const t of staleTokens) tokenUpdates[`fcmTokens.${t}`] = admin.firestore.FieldValue.delete()
      await db.doc(`users/${uid}`).update(tokenUpdates)
    }
  } catch (err) {
    logger.warn('FCM push failed (non-fatal)', err?.message)
  }
}

// ─── Shared: run form actions after a response is created/payment completed ───

async function runFormActions(responseData, formId, skipEmailActions, responseId = '', skipSubmitterEmail = false) {
  const { answers } = responseData

  const formSnap = await db.doc(`forms/${formId}`).get()
  if (!formSnap.exists) return
  const form = formSnap.data()

  const actions = form.actions ?? []

  const labels = {}
  for (const node of (form.nodes ?? [])) {
    labels[node.id] = node.properties?.label || node.id
  }

  const appUrl = `https://${admin.app().options.projectId}.web.app`

  // Ricava il nome del compilatore dal primo campo testo/email/nome compilato
  const textTypes = ['short_text', 'text', 'name', 'email', 'phone']
  const nameNode = (form.nodes ?? []).find(n => textTypes.includes(n.type) && answers[n.id])
  const nomeCompilatore = nameNode ? displayValue(answers[nameNode.id]) : ''

  const meta = {
    form_title: form.title ?? '',
    form_id: formId,
    response_id: responseId,
    ticket_url: responseId ? `${appUrl}/admin/checkin/${formId}?scan=${responseId}` : '',
    my_portal_url: `${appUrl}/my`,
    nome_compilatore: nomeCompilatore,
    nome: nomeCompilatore,
  }

  let workspaceId = form.workspaceId
  if (!workspaceId || workspaceId === 'default') {
    const userSnap = await db.doc(`users/${form.createdBy}`).get()
    const altId = userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null
    workspaceId = altId || form.createdBy
    logger.info(`runFormActions: legacy workspaceId resolved → ${workspaceId}`)
  }
  logger.info(`runFormActions: formId=${formId} workspaceId=${workspaceId} skipEmailActions=${skipEmailActions}`)
  const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
  const smtp = wsSnap.exists ? (wsSnap.data().smtp ?? null) : null
  const emailTemplates = wsSnap.exists ? (wsSnap.data().emailTemplates ?? {}) : {}
  logger.info(`runFormActions: wsSnap.exists=${wsSnap.exists} hasSMTP=${!!smtp} hasAdminTpl=${!!emailTemplates.adminNotification} hasSubmitterTpl=${!!emailTemplates.submitterConfirmation} actions=${actions.length}`)

  // ── Azioni form esplicite ──────────────────────────────────────────────────
  for (const action of actions) {
    if (!action.enabled) continue

    try {
      if (action.type === 'send_email') {
        if (skipEmailActions) { logger.info('send_email: skipped — payment pending'); continue }
        if (!smtp) { logger.warn('send_email action: no SMTP configured'); continue }
        const { to, subject, body } = action.config
        const subjectFilled = fillTemplate(subject, labels, answers, meta)
        const bodyFilled = body && body.trim()
          ? fillTemplate(body, labels, answers, meta)
          : buildOrganizerEmail(form.title ?? '', formId, responseId, labels, answers, appUrl)
        const transporter = createTransporter(smtp)
        await transporter.sendMail({
          from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
          to: to.join(', '),
          replyTo: action.config.replyTo || undefined,
          subject: subjectFilled,
          html: bodyFilled,
        })
        logger.info(`send_email sent to ${to.join(', ')} for form ${formId}`)
      }

      if (action.type === 'webhook') {
        const { url, method, headers } = action.config
        const fetchFn = (await import('node-fetch')).default
        await fetchFn(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
          body: method !== 'GET' ? JSON.stringify({ formId, answers, labels }) : undefined,
        })
        logger.info(`webhook ${method} ${url} for form ${formId}`)
      }

      if (action.type === 'notify_submitter') {
        if (skipEmailActions) { logger.info('notify_submitter: skipped — payment pending'); continue }
        if (skipSubmitterEmail) { logger.info('notify_submitter: skipped — admin opted out'); continue }
        if (!smtp) { logger.warn('notify_submitter action: no SMTP configured'); continue }
        const { emailFieldId, subject, body } = action.config
        const recipientEmail = answers[emailFieldId]
        if (!recipientEmail || typeof recipientEmail !== 'string') continue
        const subjectFilled = fillTemplate(subject, labels, answers, meta)
        const bodyFilled = body
          ? fillTemplate(body, labels, answers, meta)
          : buildAutoTable(labels, answers)
        const transporter = createTransporter(smtp)
        await transporter.sendMail({
          from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
          to: recipientEmail,
          subject: subjectFilled,
          html: bodyFilled,
        })
        logger.info(`notify_submitter sent to ${recipientEmail} for form ${formId}`)
      }
    } catch (err) {
      logger.error(`Action ${action.type} failed`, err)
    }
  }

  // ── Fallback ai template workspace se nessuna azione email/notify configurata ─
  if (!smtp) {
    logger.warn(`runFormActions: no SMTP in workspace_settings/${workspaceId} — email skipped`)
    return
  }

  const hasEmailAction = actions.some(a => a.enabled && a.type === 'send_email')
  const hasNotifyAction = actions.some(a => a.enabled && a.type === 'notify_submitter')

  // Notifica admin via template workspace (sempre, indipendente dal pagamento)
  if (!hasEmailAction && emailTemplates.adminNotification) {
    try {
      const tpl = emailTemplates.adminNotification
      const allAnswersHtml = buildAutoTable(labels, answers)
      const metaWithAll = { ...meta, all_answers: allAnswersHtml }
      const subject = fillTemplate(tpl.subject || 'Nuova risposta: {{form_title}}', labels, answers, metaWithAll)
      const body = tpl.body && tpl.body.trim()
        ? fillTemplate(tpl.body, labels, answers, metaWithAll)
        : buildOrganizerEmail(form.title ?? '', formId, responseId, labels, answers, appUrl)
      const adminEmail = smtp.fromEmail
      const transporter = createTransporter(smtp)
      await transporter.sendMail({
        from: `"${smtp.fromName}" <${adminEmail}>`,
        to: adminEmail,
        subject,
        html: body,
      })
      logger.info(`workspace adminNotification sent to ${adminEmail} for form ${formId}`)
    } catch (err) {
      logger.error('workspace adminNotification failed', err)
    }
  }

  // Conferma compilatore via template workspace (solo se pagamento non pending e admin non ha disabilitato)
  if (!hasNotifyAction && emailTemplates.submitterConfirmation) {
    if (skipEmailActions) {
      logger.info('workspace submitterConfirmation: skipped — payment pending')
    } else if (skipSubmitterEmail) {
      logger.info('workspace submitterConfirmation: skipped — admin opted out')
    } else {
      const emailNode = (form.nodes ?? []).find(n => n.type === 'email')
      const recipientEmail = emailNode ? answers[emailNode.id] : null
      if (recipientEmail && typeof recipientEmail === 'string') {
        try {
          const tpl = emailTemplates.submitterConfirmation
          const allAnswersHtml = buildAutoTable(labels, answers)
          const metaWithAll = { ...meta, all_answers: allAnswersHtml }
          const subject = fillTemplate(tpl.subject || 'Conferma iscrizione', labels, answers, metaWithAll)
          const body = tpl.body && tpl.body.trim()
            ? fillTemplate(tpl.body, labels, answers, metaWithAll)
            : buildAutoTable(labels, answers)
          const transporter = createTransporter(smtp)
          await transporter.sendMail({
            from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
            to: recipientEmail,
            subject,
            html: body,
          })
          logger.info(`workspace submitterConfirmation sent to ${recipientEmail} for form ${formId}`)
        } catch (err) {
          logger.error('workspace submitterConfirmation failed', err)
        }
      }
    }
  }
}

// ─── onFormSubmit — triggered when a new response is written ─────────────────

exports.onFormSubmit = onDocumentCreated({ document: 'responses/{responseId}', database: '(default)' }, async (event) => {
  const response = event.data.data()
  const { formId } = response
  if (!formId) return

  const formSnap = await db.doc(`forms/${formId}`).get()
  if (!formSnap.exists) return
  const form = formSnap.data()

  const hasPaymentNode = (form.nodes ?? []).some(n => n.type === 'payment')
  // Per pagamenti "di persona" le email vanno inviate subito (il pagamento è atteso in loco)
  const isInPerson = response.paymentMethod === 'in_person'
  // 'none' = gratuito/esentato → non bloccare le email; solo 'pending' le blocca
  const paymentPending = hasPaymentNode && response.paymentStatus === 'pending' && !isInPerson
  const skipSubmitterEmail = response.skipSubmitterEmail === true

  await runFormActions(response, formId, paymentPending, event.params.responseId, skipSubmitterEmail)

  // Notify form owner (in-app + push)
  const ownerId = form.createdBy
  if (ownerId) {
    await createNotification({
      uid: ownerId,
      title: `Nuova risposta — ${form.title ?? 'Form'}`,
      body: 'È arrivata una nuova compilazione.',
      threadId: formId,
      threadType: 'form',
      url: `/responses/${formId}`,
    }).catch(err => logger.warn('createNotification failed', err?.message))
  }
})

// ─── onPaymentCompleted — triggered when paymentStatus changes to 'completed' ─

exports.onPaymentCompleted = onDocumentUpdated({ document: 'responses/{responseId}', database: '(default)' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()

  if (before.paymentStatus === after.paymentStatus) return
  if (after.paymentStatus !== 'completed') return

  const { formId } = after
  if (!formId) return

  // Esegui azioni email solo per pagamenti PayPal completati automaticamente.
  // Per pagamenti manuali (admin, cassa, in_person) le email non devono scattare qui.
  if (!after.paypalOrderId) {
    logger.info(`onPaymentCompleted: skipping email actions — no paypalOrderId for responseId=${event.params.responseId}`)
    // Manda solo notifica in-app, poi esci
    const formSnapQuick = await db.doc(`forms/${formId}`).get()
    if (formSnapQuick.exists) {
      await createNotification({
        uid: formSnapQuick.data().createdBy,
        title: `Pagamento ricevuto — ${formSnapQuick.data().title ?? 'Form'}`,
        body: 'Un partecipante ha completato il pagamento.',
        threadId: formId,
        threadType: 'form',
        url: `/responses/${formId}`,
      }).catch(() => {})
    }
    return
  }

  logger.info(`onPaymentCompleted: responseId=${event.params.responseId} formId=${formId}`)
  await runFormActions(after, formId, false, event.params.responseId)

  // Notify form owner about completed payment
  const formSnap = await db.doc(`forms/${formId}`).get()
  if (formSnap.exists) {
    const form = formSnap.data()
    await createNotification({
      uid: form.createdBy,
      title: `Pagamento ricevuto — ${form.title ?? 'Form'}`,
      body: 'Un partecipante ha completato il pagamento.',
      threadId: formId,
      threadType: 'form',
      url: `/responses/${formId}`,
    }).catch(err => logger.warn('createNotification failed', err?.message))

    // Invia ricevuta fiscale automatica se configurata
    try {
      let workspaceId = form.workspaceId
      if (!workspaceId || workspaceId === 'default') {
        const userSnap = await db.doc(`users/${form.createdBy}`).get()
        const altId = userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null
        workspaceId = altId || form.createdBy
      }
      const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
      const ws = wsSnap.exists ? wsSnap.data() : {}

      if (ws.fiscal?.organizationName && ws.fiscal?.fiscalCode && ws.smtp?.host) {
        // Trova email destinatario dalle risposte
        const nodes = form.nodes ?? []
        let recipientEmail = ''
        for (const node of nodes) {
          if (node.type === 'email') {
            const val = (after.answers ?? {})[node.id]
            if (val && typeof val === 'string') { recipientEmail = val.trim(); break }
          }
        }

        if (recipientEmail) {
          // Genera numero ricevuta
          const receiptNumber = await getNextReceiptNumber(workspaceId)
          await db.doc(`responses/${event.params.responseId}`).update({ receiptNumber })

          // Trova nome destinatario
          let recipientName = ''
          for (const node of nodes) {
            if (node.type === 'short_text' || node.type === 'text') {
              const val = (after.answers ?? {})[node.id]
              if (val && typeof val === 'string') { recipientName = val.trim(); break }
            }
          }
          if (!recipientName) recipientName = recipientEmail

          let amount = after.paymentAmount ?? 0
          let currency = 'EUR'
          const paymentNode = nodes.find(n => n.type === 'payment')
          if (paymentNode) {
            currency = paymentNode.properties?.currency ?? 'EUR'
            if (!amount) amount = paymentNode.properties?.amount ?? 0
          }

          let eventDate
          if (after.eventId) {
            const eventSnap = await db.doc(`events/${after.eventId}`).get()
            if (eventSnap.exists) eventDate = eventSnap.data().startDate
          }

          const receipt = {
            receiptNumber,
            receiptDate: new Date().toISOString().split('T')[0],
            recipientName,
            recipientEmail,
            amount,
            currency,
            eventTitle: form.title ?? 'Iscrizione',
            eventDate,
            paymentMethod: 'PayPal',
            paypalOrderId: after.paypalOrderId,
          }

          const html = buildReceiptHtml(ws.fiscal, receipt)
          const transporter = createTransporter(ws.smtp)
          await transporter.sendMail({
            from: `"${ws.smtp.fromName || ws.fiscal.organizationName}" <${ws.smtp.fromEmail}>`,
            to: recipientEmail,
            subject: `Ricevuta ${receiptNumber} — ${form.title ?? 'Iscrizione'}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px 0"><p style="color:#444653;margin:0 0 20px">Gentile <strong>${recipientName}</strong>,<br>di seguito trovi la tua ricevuta per il pagamento effettuato.</p>${html}<p style="color:#c4c5d5;font-size:11px;margin:20px 0 0;text-align:center">Powered by Solidando</p></div>`,
          })
          logger.info(`onPaymentCompleted: receipt ${receiptNumber} sent to ${recipientEmail}`)
        }
      }
    } catch (err) {
      logger.warn('Receipt auto-send failed (non-fatal)', err?.message)
    }
  }
})

// ─── capturePaypalOrder — server-side capture to avoid 403 from browser ──────

exports.capturePaypalOrder = onCall({ region: 'europe-west1' }, async (request) => {
  const { orderID, workspaceId } = request.data

  if (!orderID || !workspaceId) {
    throw new HttpsError('invalid-argument', 'orderID e workspaceId sono obbligatori')
  }

  logger.info(`capturePaypalOrder: orderID=${orderID} workspaceId=${workspaceId}`)

  let wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()

  if (!wsSnap.exists || !wsSnap.data()?.paypal?.clientId) {
    const userSnap = await db.doc(`users/${workspaceId}`).get()
    if (userSnap.exists) {
      const altId = userSnap.data()?.workspaceIds?.[0]
      if (altId && altId !== workspaceId) {
        logger.info(`capturePaypalOrder: fallback workspaceId ${workspaceId} → ${altId}`)
        wsSnap = await db.doc(`workspace_settings/${altId}`).get()
      }
    }
  }

  if (!wsSnap.exists) throw new HttpsError('not-found', 'Workspace non trovato')

  const { paypal } = wsSnap.data()
  if (!paypal?.clientId || !paypal?.clientSecret) {
    throw new HttpsError('failed-precondition', 'Credenziali PayPal non configurate')
  }

  const { clientId, clientSecret } = paypal
  const sandbox = paypal.sandbox ?? true
  const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

  const fetchFn = (await import('node-fetch')).default

  const tokenRes = await fetchFn(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    logger.error('PayPal token error', err)
    throw new HttpsError('internal', 'Impossibile ottenere token PayPal')
  }

  const { access_token } = await tokenRes.json()

  const captureRes = await fetchFn(`${base}/v2/checkout/orders/${orderID}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!captureRes.ok) {
    const err = await captureRes.text()
    logger.error('PayPal capture error', err)
    throw new HttpsError('internal', 'Capture PayPal fallita')
  }

  const result = await captureRes.json()
  logger.info(`PayPal order ${orderID} captured: ${result.status}`)
  return { status: result.status, id: result.id }
})

// ─── checkInResponse — segna l'ingresso di un partecipante ───────────────────

exports.checkInResponse = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId, attendeeCount } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const ref = db.doc(`responses/${responseId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Risposta non trovata')

  const data = snap.data()
  if (data.checkInStatus === 'checked_in') {
    return { alreadyCheckedIn: true, checkInAt: data.checkInAt?.toDate?.().toISOString() ?? null }
  }

  const updateData = {
    checkInStatus: 'checked_in',
    checkInAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  // Sovrascrive attendeeCount se specificato dall'admin (persone realmente presenti != iscrizione)
  if (attendeeCount != null && Number.isInteger(attendeeCount) && attendeeCount > 0) {
    updateData.attendeeCount = attendeeCount
  }

  await ref.update(updateData)

  logger.info(`checkIn: responseId=${responseId} uid=${request.auth.uid} attendeeCount=${attendeeCount ?? 'unchanged'}`)
  return { alreadyCheckedIn: false }
})

// ─── getResponseForCheckin — lettura dati biglietto (solo admin) ──────────────

exports.getResponseForCheckin = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const snap = await db.doc(`responses/${responseId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Risposta non trovata')

  const data = snap.data()

  const formSnap = await db.doc(`forms/${data.formId}`).get()
  const form = formSnap.exists ? formSnap.data() : null
  const nodes = form?.nodes ?? []
  const variables = form?.variables ?? []
  const labels = {}
  for (const node of nodes) {
    labels[node.id] = node.properties?.label || node.id
  }

  const paymentNode = nodes.find(n => n.type === 'payment') ?? null
  let paymentAmount = data.paymentAmount ?? null
  let paymentCurrency = null
  if (paymentNode) {
    paymentCurrency = paymentNode.properties?.currency ?? 'EUR'
    if (paymentAmount == null) {
      const formula = paymentNode.properties?.paymentFormula
      if (formula && formula.fieldId && formula.variableId) {
        const variable = variables.find(v => v.id === formula.variableId)
        const rawAnswer = (data.answers ?? {})[formula.fieldId]
        const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
        const varVal = variable ? variable.value : 0
        switch (formula.op) {
          case '*': paymentAmount = fieldVal * varVal; break
          case '+': paymentAmount = fieldVal + varVal; break
          case '-': paymentAmount = fieldVal - varVal; break
          case '/': paymentAmount = varVal !== 0 ? fieldVal / varVal : 0; break
        }
      } else {
        paymentAmount = paymentNode.properties?.amount ?? null
      }
    }
  }

  return {
    responseId: snap.id,
    formId: data.formId,
    formTitle: form?.title ?? 'Form',
    submittedAt: data.submittedAt?.toDate?.().toISOString() ?? null,
    paymentStatus: data.paymentStatus ?? 'pending',
    paymentAmount,
    paymentCurrency,
    checkInStatus: data.checkInStatus ?? 'not_checked_in',
    checkInAt: data.checkInAt?.toDate?.().toISOString() ?? null,
    answers: data.answers ?? {},
    labels,
    attendeeCount: data.attendeeCount ?? 1,
  }
})

// ─── getPublicTicket — lettura dati biglietto senza auth (responseId come token) ──

exports.getPublicTicket = onCall({ region: 'europe-west1' }, async (request) => {
  const { responseId } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const snap = await db.doc(`responses/${responseId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Biglietto non trovato')

  const data = snap.data()

  const formSnap = await db.doc(`forms/${data.formId}`).get()
  const form = formSnap.exists ? formSnap.data() : null
  const nodes = form?.nodes ?? []
  const variables = form?.variables ?? []
  const labels = {}
  for (const node of nodes) {
    labels[node.id] = node.properties?.label || node.id
  }

  const paymentNode = nodes.find(n => n.type === 'payment') ?? null
  let paymentAmount = data.paymentAmount ?? null
  let paymentCurrency = null
  if (paymentNode) {
    paymentCurrency = paymentNode.properties?.currency ?? 'EUR'
    if (paymentAmount == null) {
      const formula = paymentNode.properties?.paymentFormula
      if (formula && formula.fieldId && formula.variableId) {
        const variable = variables.find(v => v.id === formula.variableId)
        const rawAnswer = (data.answers ?? {})[formula.fieldId]
        const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
        const varVal = variable ? variable.value : 0
        switch (formula.op) {
          case '*': paymentAmount = fieldVal * varVal; break
          case '+': paymentAmount = fieldVal + varVal; break
          case '-': paymentAmount = fieldVal - varVal; break
          case '/': paymentAmount = varVal !== 0 ? fieldVal / varVal : 0; break
        }
      } else {
        paymentAmount = paymentNode.properties?.amount ?? null
      }
    }
  }

  return {
    responseId: snap.id,
    formId: data.formId,
    formTitle: form?.title ?? 'Form',
    submittedAt: data.submittedAt?.toDate?.().toISOString() ?? null,
    paymentStatus: data.paymentStatus ?? 'pending',
    paymentAmount,
    paymentCurrency,
    checkInStatus: data.checkInStatus ?? 'not_checked_in',
    checkInAt: data.checkInAt?.toDate?.().toISOString() ?? null,
    answers: data.answers ?? {},
    labels,
  }
})

// ─── testSmtp — callable to verify SMTP from Settings UI ─────────────────────

exports.testSmtp = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { smtp } = request.data
  if (!smtp?.host || !smtp?.user || !smtp?.password) {
    throw new HttpsError('invalid-argument', 'Configurazione SMTP incompleta')
  }

  try {
    const transporter = createTransporter(smtp)
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    throw new HttpsError('internal', `SMTP error: ${err.message}`)
  }
})

// ─── sendNotification — admin pushes a notification to users/form/event thread ─

exports.sendNotification = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const callerSnap = await db.doc(`users/${request.auth.uid}`).get()
  if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo gli admin possono inviare notifiche')
  }

  const { title, body, threadId, threadType, url, targetUids } = request.data

  if (!title || !body) throw new HttpsError('invalid-argument', 'title e body sono obbligatori')

  let uids = []

  if (Array.isArray(targetUids) && targetUids.length > 0) {
    uids = targetUids
  } else if (threadId && threadType === 'form') {
    // Notify all users who submitted this form
    const responsesSnap = await db.collection('responses').where('formId', '==', threadId).get()
    const set = new Set()
    responsesSnap.docs.forEach(d => {
      const uid = d.data().uid
      if (uid) set.add(uid)
    })
    uids = [...set]
  } else if (threadId && threadType === 'event') {
    // Notify all users registered to this event (via eventId on response)
    const responsesSnap = await db.collection('responses').where('eventId', '==', threadId).get()
    const set = new Set()
    responsesSnap.docs.forEach(d => {
      const uid = d.data().uid
      if (uid) set.add(uid)
    })
    uids = [...set]
  }

  if (uids.length === 0) {
    return { sent: 0 }
  }

  await Promise.all(
    uids.map(uid =>
      createNotification({ uid, title, body, threadId, threadType, url }).catch(err =>
        logger.warn(`Notification failed for uid=${uid}`, err?.message)
      )
    )
  )

  logger.info(`sendNotification: sent to ${uids.length} users — "${title}"`)
  return { sent: uids.length }
})

// ─── sendTestEmail — invia una email di prova con dati mock ──────────────────

exports.sendTestEmail = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { workspaceId, actionType, subject, body, to } = request.data

  if (!workspaceId) throw new HttpsError('invalid-argument', 'workspaceId obbligatorio')
  if (!actionType || !['send_email', 'notify_submitter', 'adminNotification', 'submitterConfirmation'].includes(actionType)) {
    throw new HttpsError('invalid-argument', 'actionType non valido')
  }

  const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
  if (!wsSnap.exists) throw new HttpsError('not-found', 'Workspace non trovato')
  const smtp = wsSnap.data().smtp
  if (!smtp?.host || !smtp?.user || !smtp?.password) {
    throw new HttpsError('failed-precondition', 'SMTP non configurato nel workspace')
  }

  const appUrl = `https://${admin.app().options.projectId}.web.app`

  // Dati mock per il template
  const mockAnswers = {
    mock_nome: 'Mario Rossi',
    mock_email: 'mario.rossi@example.com',
    mock_telefono: '+39 333 1234567',
    mock_messaggio: 'Questo è un messaggio di esempio per testare il template email.',
  }
  const mockLabels = {
    mock_nome: 'Nome',
    mock_email: 'Email',
    mock_telefono: 'Telefono',
    mock_messaggio: 'Messaggio',
  }
  const mockResponseId = 'TEST-' + Date.now()
  const meta = {
    form_title: 'Form di esempio (TEST)',
    form_id: 'test-form-id',
    response_id: mockResponseId,
    ticket_url: `${appUrl}/my`,
    my_portal_url: `${appUrl}/my`,
    nome_compilatore: 'Mario Rossi',
    nome: 'Mario Rossi',
    all_answers: buildAutoTable(mockLabels, mockAnswers),
  }

  const subjectFilled = fillTemplate(subject || 'Email di prova: {{form_title}}', mockLabels, mockAnswers, meta)
  const bodyFilled = body && body.trim()
    ? fillTemplate(body, mockLabels, mockAnswers, meta)
    : buildOrganizerEmail('Form di esempio (TEST)', 'test-form-id', mockResponseId, mockLabels, mockAnswers, appUrl)

  const recipient = to || smtp.fromEmail
  if (!recipient) throw new HttpsError('invalid-argument', 'Destinatario non specificato')

  try {
    const transporter = createTransporter(smtp)
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: recipient,
      subject: `[TEST] ${subjectFilled}`,
      html: bodyFilled,
    })
    logger.info(`sendTestEmail: sent to ${recipient} (actionType=${actionType})`)
    return { ok: true, to: recipient }
  } catch (err) {
    logger.error('sendTestEmail failed', err)
    throw new HttpsError('internal', `Errore invio: ${err.message}`)
  }
})

// ─── buildReceiptHtml — genera HTML ricevuta fiscale (plain, no React) ──────

function buildReceiptHtml(fiscal, receipt) {
  function fmtCurrency(amount, currency) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount)
  }
  function fmtDate(iso) {
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
  }

  return `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#002068;padding:28px 36px 22px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <p style="color:#8aa4ff;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px">RICEVUTA</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0">${fiscal.organizationName}</h1>
        ${fiscal.vatNumber ? `<p style="color:#b0c4ff;font-size:11px;margin:4px 0 0;font-family:monospace">P.IVA ${fiscal.vatNumber}</p>` : ''}
        <p style="color:#b0c4ff;font-size:11px;margin:2px 0 0;font-family:monospace">C.F. ${fiscal.fiscalCode}</p>
      </td>
      <td style="text-align:right;vertical-align:top">
        <p style="color:#fe9832;font-size:15px;font-weight:900;margin:0;font-family:monospace">${receipt.receiptNumber}</p>
        <p style="color:#b0c4ff;font-size:11px;margin:4px 0 0">${fmtDate(receipt.receiptDate)}</p>
      </td>
    </tr></table>
  </div>
  <div style="padding:28px 36px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
      <td width="50%" style="vertical-align:top;padding-right:12px">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 6px">Emittente</p>
        <p style="font-weight:700;color:#1a1b22;margin:0 0 2px">${fiscal.organizationName}</p>
        <p style="color:#444653;margin:0 0 2px">${fiscal.address}</p>
        <p style="color:#444653;margin:0 0 2px">${fiscal.postalCode} ${fiscal.city} (${fiscal.province})</p>
        ${fiscal.phone ? `<p style="color:#444653;margin:0 0 2px">Tel. ${fiscal.phone}</p>` : ''}
        ${fiscal.email ? `<p style="color:#444653;margin:0">${fiscal.email}</p>` : ''}
      </td>
      <td width="50%" style="vertical-align:top;padding-left:12px">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 6px">Destinatario</p>
        <p style="font-weight:700;color:#1a1b22;margin:0 0 2px">${receipt.recipientName}</p>
        ${receipt.recipientEmail ? `<p style="color:#444653;margin:0">${receipt.recipientEmail}</p>` : ''}
      </td>
    </tr></table>
    <hr style="border:none;border-top:1px solid #e8e7f0;margin:0 0 24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-collapse:collapse">
      <thead>
        <tr style="background:#f4f3fc">
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Descrizione / Causale</th>
          ${receipt.eventDate ? `<th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Data evento</th>` : ''}
          <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Importo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:12px 14px;color:#1a1b22;font-weight:600;border-bottom:1px solid #e8e7f0">${receipt.receiptDescription ?? `Contributo liberale per raccolta fondi occasionale ${receipt.eventTitle}`}</td>
          ${receipt.eventDate ? `<td style="padding:12px 14px;text-align:center;color:#444653;border-bottom:1px solid #e8e7f0">${fmtDate(receipt.eventDate)}</td>` : ''}
          <td style="padding:12px 14px;text-align:right;color:#1a1b22;font-weight:700;font-family:monospace;border-bottom:1px solid #e8e7f0">${fmtCurrency(receipt.amount, receipt.currency)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="background:#002068">
          <td ${receipt.eventDate ? 'colspan="2"' : ''} style="padding:12px 14px;color:#8aa4ff;font-weight:700;font-size:12px">TOTALE PAGATO</td>
          <td style="padding:12px 14px;text-align:right;color:#ffffff;font-weight:900;font-size:18px;font-family:monospace">${fmtCurrency(receipt.amount, receipt.currency)}</td>
        </tr>
      </tfoot>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
      <td style="padding:10px 16px;background:#f4f3fc;border-radius:8px;border:1px solid #e8e7f0">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 3px">Metodo di pagamento</p>
        <p style="font-weight:700;color:#1a1b22;margin:0">${receipt.paymentMethod}</p>
      </td>
      ${receipt.paypalOrderId ? `
      <td width="16"></td>
      <td style="padding:10px 16px;background:#f4f3fc;border-radius:8px;border:1px solid #e8e7f0">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 3px">ID transazione PayPal</p>
        <p style="font-weight:600;color:#444653;margin:0;font-family:monospace;font-size:11px">${receipt.paypalOrderId}</p>
      </td>` : ''}
    </tr></table>
    ${fiscal.notes ? `<div style="padding:12px 16px;background:#fffbe6;border-radius:8px;border:1px solid #ffe082;margin-bottom:16px"><p style="font-size:11px;color:#7a5800;margin:0;line-height:1.6">${fiscal.notes}</p></div>` : ''}
    <div style="border-top:1px solid #e8e7f0;padding-top:16px">
      <p style="font-size:10px;color:#c4c5d5;margin:0">Ricevuta generata elettronicamente · ${receipt.receiptNumber}</p>
    </div>
  </div>
</div>`
}

// ─── nextReceiptNumber — genera numero progressivo ricevuta per workspace ─────

async function getNextReceiptNumber(workspaceId) {
  const counterRef = db.doc(`receipt_counters/${workspaceId}`)
  let newNumber
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    let current = snap.exists ? (snap.data().counter ?? 0) : 0

    // Se il counter è > 0 ma non ci sono ricevute attive (tutte eliminate),
    // verifica il massimo reale su Firestore per evitare buchi nel contatore.
    // Non è possibile fare query Firestore dentro una transazione, quindi
    // questa verifica è fatta fuori (vedi sotto, pre-transazione).
    newNumber = current + 1
    tx.set(counterRef, { counter: newNumber, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
  })
  const year = new Date().getFullYear()
  return `${String(newNumber).padStart(4, '0')}/${year}`
}

// Sincronizza il counter con il massimo numero di ricevuta realmente presente
// su Firestore. Da chiamare quando si sospetta un disallineamento.
async function syncReceiptCounter(workspaceId) {
  const year = new Date().getFullYear()
  const suffix = `/${year}`
  // Cerca tutte le risposte con ricevuta attiva (non annullata) per questo workspace
  const responsesSnap = await db.collection('responses')
    .where('receiptNumber', '!=', null)
    .get()
  let maxNum = 0
  for (const doc of responsesSnap.docs) {
    const rn = doc.data().receiptNumber
    if (!rn || doc.data().receiptVoided) continue
    // Formato: "0042/2026"
    if (rn.endsWith(suffix)) {
      const n = parseInt(rn.split('/')[0], 10)
      if (!isNaN(n) && n > maxNum) maxNum = n
    }
  }
  const counterRef = db.doc(`receipt_counters/${workspaceId}`)
  await counterRef.set({ counter: maxNum, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
  logger.info(`syncReceiptCounter: counter workspace ${workspaceId} sincronizzato a ${maxNum}`)
  return maxNum
}

// ─── sendReceipt — callable: invia/reinvia ricevuta fiscale per una risposta ──

exports.sendReceipt = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId, recipientEmail: overrideEmail, sendEmail = true } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  // Carica risposta
  const responseSnap = await db.doc(`responses/${responseId}`).get()
  if (!responseSnap.exists) throw new HttpsError('not-found', 'Risposta non trovata')
  const responseData = responseSnap.data()

  if (responseData.paymentStatus !== 'completed') {
    throw new HttpsError('failed-precondition', 'Il pagamento non è ancora completato')
  }

  // Carica form
  const formSnap = await db.doc(`forms/${responseData.formId}`).get()
  if (!formSnap.exists) throw new HttpsError('not-found', 'Form non trovato')
  const form = formSnap.data()

  // Risolve workspaceId (gestisce legacy 'default' come runFormActions)
  let workspaceId = form.workspaceId || responseData.workspaceId
  if (!workspaceId || workspaceId === 'default') {
    const userSnap = await db.doc(`users/${form.createdBy}`).get()
    const altId = userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null
    workspaceId = altId || form.createdBy
    logger.info(`sendReceipt: legacy workspaceId resolved → ${workspaceId}`)
  }

  // Carica workspace settings
  const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
  if (!wsSnap.exists) throw new HttpsError('not-found', 'Workspace non trovato')
  const ws = wsSnap.data()

  if (!ws.smtp?.host || !ws.smtp?.user || !ws.smtp?.password) {
    throw new HttpsError('failed-precondition', 'SMTP non configurato')
  }
  if (!ws.fiscal?.organizationName || !ws.fiscal?.fiscalCode || !ws.fiscal?.address) {
    throw new HttpsError('failed-precondition', 'Dati fiscali non configurati nelle impostazioni')
  }

  // Determina dati ricevuta
  const fiscal = ws.fiscal

  // Cerca nome destinatario tra le risposte (primo campo text/email)
  const nodes = form.nodes ?? []
  let recipientName = ''
  let recipientEmailFromAnswers = ''
  for (const node of nodes) {
    const val = (responseData.answers ?? {})[node.id]
    if (!val) continue
    const t = node.type
    if (!recipientName && (t === 'short_text' || t === 'text') && typeof val === 'string' && val.trim()) {
      recipientName = val.trim()
    }
    if (!recipientEmailFromAnswers && t === 'email' && typeof val === 'string') {
      recipientEmailFromAnswers = val.trim()
    }
  }
  if (!recipientName) recipientName = recipientEmailFromAnswers || 'N/D'

  const recipientEmail = overrideEmail || recipientEmailFromAnswers
  if (sendEmail && !recipientEmail) throw new HttpsError('invalid-argument', 'Nessun indirizzo email destinatario trovato')

  // Recupera o genera numero ricevuta
  let receiptNumber = responseData.receiptNumber
  if (!receiptNumber) {
    receiptNumber = await getNextReceiptNumber(workspaceId)
    await db.doc(`responses/${responseId}`).update({ receiptNumber })
  }

  // Importo
  let amount = responseData.paymentAmount ?? 0
  let currency = 'EUR'
  const paymentNode = nodes.find(n => n.type === 'payment')
  if (paymentNode) {
    currency = paymentNode.properties?.currency ?? 'EUR'
    if (!amount) {
      const formula = paymentNode.properties?.paymentFormula
      if (formula?.fieldId && formula?.variableId) {
        const variables = form.variables ?? []
        const variable = variables.find(v => v.id === formula.variableId)
        const rawAnswer = (responseData.answers ?? {})[formula.fieldId]
        const fieldVal = rawAnswer !== undefined ? Number(rawAnswer) : 0
        const varVal = variable ? variable.value : 0
        switch (formula.op) {
          case '*': amount = fieldVal * varVal; break
          case '+': amount = fieldVal + varVal; break
          case '-': amount = fieldVal - varVal; break
          case '/': amount = varVal !== 0 ? fieldVal / varVal : 0; break
        }
      } else {
        amount = paymentNode.properties?.amount ?? 0
      }
    }
  }

  // Data evento e dicitura (se la risposta è associata a un evento)
  let eventDate
  let receiptDescription
  if (responseData.eventId) {
    const eventSnap = await db.doc(`events/${responseData.eventId}`).get()
    if (eventSnap.exists) {
      eventDate = eventSnap.data().startDate
      receiptDescription = eventSnap.data().receiptDescription || undefined
    }
  }

  const paymentMethod = responseData.paymentMethod === 'paypal' ? 'PayPal' : responseData.paymentMethod === 'in_person' ? 'Contanti / Persona' : 'N/D'

  const receipt = {
    receiptNumber,
    receiptDate: new Date().toISOString().split('T')[0],
    recipientName,
    recipientEmail,
    amount,
    currency,
    eventTitle: form.title ?? 'Iscrizione',
    receiptDescription,
    eventDate,
    paymentMethod,
    paypalOrderId: responseData.paypalOrderId,
  }

  if (sendEmail) {
    const html = buildReceiptHtml(fiscal, receipt)
    const transporter = createTransporter(ws.smtp)
    await transporter.sendMail({
      from: `"${ws.smtp.fromName || fiscal.organizationName}" <${ws.smtp.fromEmail}>`,
      to: recipientEmail,
      subject: `Ricevuta ${receiptNumber} — ${form.title ?? 'Iscrizione'}`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px 0">
  <p style="color:#444653;margin:0 0 20px">Gentile <strong>${recipientName}</strong>,<br>di seguito trovi la tua ricevuta per il pagamento effettuato.</p>
  ${html}
  <p style="color:#c4c5d5;font-size:11px;margin:20px 0 0;text-align:center">Powered by Solidando</p>
</div>`,
    })
    logger.info(`sendReceipt: sent ${receiptNumber} to ${recipientEmail} for response ${responseId}`)
  } else {
    logger.info(`sendReceipt: generated ${receiptNumber} for response ${responseId} (email skipped)`)
  }

  return { ok: true, receiptNumber, to: recipientEmail ?? null }
})

// ─── voidReceipt — callable: annulla una ricevuta fiscale ────────────────────

exports.voidReceipt = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId, sendVoidNotice = false } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const responseSnap = await db.doc(`responses/${responseId}`).get()
  if (!responseSnap.exists) throw new HttpsError('not-found', 'Risposta non trovata')
  const responseData = responseSnap.data()

  const receiptNumber = responseData.receiptNumber
  if (!receiptNumber) throw new HttpsError('failed-precondition', 'Nessuna ricevuta associata a questa risposta')

  // Salva la ricevuta annullata nell'archivio voided_receipts
  await db.collection('voided_receipts').add({
    responseId,
    receiptNumber,
    formId: responseData.formId,
    voidedAt: admin.firestore.FieldValue.serverTimestamp(),
    voidedBy: request.auth.uid,
    paymentAmount: responseData.paymentAmount ?? 0,
    paymentMethod: responseData.paymentMethod ?? null,
  })

  // Rimuove receiptNumber dalla risposta e segna come annullata
  await db.doc(`responses/${responseId}`).update({
    receiptNumber: admin.firestore.FieldValue.delete(),
    receiptVoided: true,
    receiptVoidedAt: admin.firestore.FieldValue.serverTimestamp(),
    receiptVoidedNumber: receiptNumber,
  })

  // Opzionalmente invia email di notifica annullamento al destinatario
  if (sendVoidNotice) {
    try {
      const formSnap = await db.doc(`forms/${responseData.formId}`).get()
      if (formSnap.exists) {
        const form = formSnap.data()
        let workspaceId = form.workspaceId || responseData.workspaceId
        if (!workspaceId || workspaceId === 'default') {
          const userSnap = await db.doc(`users/${form.createdBy}`).get()
          workspaceId = (userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null) || form.createdBy
        }
        const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
        if (wsSnap.exists) {
          const ws = wsSnap.data()
          const nodes = form.nodes ?? []
          let recipientEmail = ''
          for (const node of nodes) {
            const val = (responseData.answers ?? {})[node.id]
            if (!recipientEmail && node.type === 'email' && typeof val === 'string') {
              recipientEmail = val.trim()
            }
          }
          if (recipientEmail && ws.smtp?.host && ws.smtp?.user && ws.smtp?.password) {
            const transporter = createTransporter(ws.smtp)
            const orgName = ws.fiscal?.organizationName || 'Organizzatore'
            await transporter.sendMail({
              from: `"${ws.smtp.fromName || orgName}" <${ws.smtp.fromEmail}>`,
              to: recipientEmail,
              subject: `Annullamento ricevuta ${receiptNumber}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <p style="color:#444653">Gentile partecipante,</p>
                <p style="color:#444653">La ricevuta n. <strong>${receiptNumber}</strong> è stata annullata da ${orgName}.</p>
                <p style="color:#747684;font-size:12px">Per ulteriori informazioni, contattare l'organizzatore.</p>
                <p style="color:#c4c5d5;font-size:11px;margin-top:24px">Powered by Solidando</p>
              </div>`,
            })
          }
        }
      }
    } catch (e) {
      logger.warn('voidReceipt: errore invio notifica annullamento', e)
    }
  }

  logger.info(`voidReceipt: annullata ricevuta ${receiptNumber} per response ${responseId}`)
  return { ok: true, voidedReceiptNumber: receiptNumber }
})

// ─── updateReceiptMeta — callable: modifica data/note di una ricevuta ─────────

exports.updateReceiptMeta = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId, recipientEmail, resend = false } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const responseSnap = await db.doc(`responses/${responseId}`).get()
  if (!responseSnap.exists) throw new HttpsError('not-found', 'Risposta non trovata')
  const responseData = responseSnap.data()

  if (!responseData.receiptNumber) {
    throw new HttpsError('failed-precondition', 'Nessuna ricevuta associata a questa risposta')
  }

  // Se richiesto reinvio con email diversa, delega a sendReceipt
  if (resend && recipientEmail) {
    // Aggiorna l'email se diversa da quella nelle risposte
    const formSnap = await db.doc(`forms/${responseData.formId}`).get()
    if (!formSnap.exists) throw new HttpsError('not-found', 'Form non trovato')
    const form = formSnap.data()

    let workspaceId = form.workspaceId || responseData.workspaceId
    if (!workspaceId || workspaceId === 'default') {
      const userSnap = await db.doc(`users/${form.createdBy}`).get()
      workspaceId = (userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null) || form.createdBy
    }
    const wsSnap = await db.doc(`workspace_settings/${workspaceId}`).get()
    if (!wsSnap.exists) throw new HttpsError('not-found', 'Workspace non trovato')
    const ws = wsSnap.data()

    if (!ws.smtp?.host || !ws.smtp?.user || !ws.smtp?.password) {
      throw new HttpsError('failed-precondition', 'SMTP non configurato')
    }
    if (!ws.fiscal?.organizationName) {
      throw new HttpsError('failed-precondition', 'Dati fiscali non configurati')
    }

    const fiscal = ws.fiscal
    const nodes = form.nodes ?? []
    let recipientName = ''
    for (const node of nodes) {
      const val = (responseData.answers ?? {})[node.id]
      if (!val) continue
      if (!recipientName && (node.type === 'short_text' || node.type === 'text') && typeof val === 'string') {
        recipientName = val.trim()
      }
    }
    if (!recipientName) recipientName = recipientEmail

    let amount = responseData.paymentAmount ?? 0
    let currency = 'EUR'
    const paymentNode = nodes.find(n => n.type === 'payment')
    if (paymentNode) currency = paymentNode.properties?.currency ?? 'EUR'

    let eventDate
    if (responseData.eventId) {
      const eventSnap = await db.doc(`events/${responseData.eventId}`).get()
      if (eventSnap.exists) eventDate = eventSnap.data().startDate
    }

    const paymentMethod = responseData.paymentMethod === 'paypal' ? 'PayPal' : responseData.paymentMethod === 'in_person' ? 'Contanti / Persona' : 'N/D'
    const receipt = {
      receiptNumber: responseData.receiptNumber,
      receiptDate: new Date().toISOString().split('T')[0],
      recipientName,
      recipientEmail,
      amount,
      currency,
      eventTitle: form.title ?? 'Iscrizione',
      eventDate,
      paymentMethod,
      paypalOrderId: responseData.paypalOrderId,
    }

    const html = buildReceiptHtml(fiscal, receipt)
    const transporter = createTransporter(ws.smtp)
    await transporter.sendMail({
      from: `"${ws.smtp.fromName || fiscal.organizationName}" <${ws.smtp.fromEmail}>`,
      to: recipientEmail,
      subject: `Ricevuta ${responseData.receiptNumber} — ${form.title ?? 'Iscrizione'}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px 0">
  <p style="color:#444653;margin:0 0 20px">Gentile <strong>${recipientName}</strong>,<br>di seguito trovi la tua ricevuta per il pagamento effettuato.</p>
  ${html}
  <p style="color:#c4c5d5;font-size:11px;margin:20px 0 0;text-align:center">Powered by Solidando</p>
</div>`,
    })

    logger.info(`updateReceiptMeta: reinviata ${responseData.receiptNumber} a ${recipientEmail}`)
    return { ok: true, receiptNumber: responseData.receiptNumber, to: recipientEmail }
  }

  return { ok: true }
})

// ─── deleteReceipt — callable: elimina una ricevuta e ricicla il numero ───────

exports.deleteReceipt = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { responseId } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const responseSnap = await db.doc(`responses/${responseId}`).get()
  if (!responseSnap.exists) throw new HttpsError('not-found', 'Risposta non trovata')
  const responseData = responseSnap.data()

  const receiptNumber = responseData.receiptNumber
  if (!receiptNumber) throw new HttpsError('failed-precondition', 'Nessuna ricevuta associata a questa risposta')

  // Ricava workspaceId per decrementare il counter
  const formSnap = await db.doc(`forms/${responseData.formId}`).get()
  let workspaceId = null
  if (formSnap.exists) {
    const form = formSnap.data()
    workspaceId = form.workspaceId || responseData.workspaceId
    if (!workspaceId || workspaceId === 'default') {
      const userSnap = await db.doc(`users/${form.createdBy}`).get()
      workspaceId = (userSnap.exists ? userSnap.data()?.workspaceIds?.[0] : null) || form.createdBy
    }
  }

  // Decrementa il counter atomicamente per rendere il numero riutilizzabile
  if (workspaceId) {
    const counterRef = db.doc(`receipt_counters/${workspaceId}`)
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef)
      if (snap.exists) {
        const current = snap.data().counter ?? 0
        if (current > 0) {
          tx.set(counterRef, { counter: current - 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        }
      }
    })
  }

  // Rimuove il numero ricevuta dalla risposta (senza traccia)
  await db.doc(`responses/${responseId}`).update({
    receiptNumber: admin.firestore.FieldValue.delete(),
    receiptVoided: admin.firestore.FieldValue.delete(),
    receiptVoidedAt: admin.firestore.FieldValue.delete(),
    receiptVoidedNumber: admin.firestore.FieldValue.delete(),
  })

  logger.info(`deleteReceipt: eliminata ricevuta ${receiptNumber} per response ${responseId}, counter decrementato`)
  return { ok: true, deletedReceiptNumber: receiptNumber }
})

// ─── resetReceiptCounter — callable: sincronizza counter con il max reale ────

exports.resetReceiptCounter = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Devi essere autenticato')

  const { workspaceId } = request.data
  if (!workspaceId) throw new HttpsError('invalid-argument', 'workspaceId obbligatorio')

  const newCounter = await syncReceiptCounter(workspaceId)
  return { ok: true, counter: newCounter }
})

// ─── Social preview renderer (Open Graph meta tags for bots) ──────────────────

const { onRequest } = require('firebase-functions/v2/https')

const BOT_UA = /whatsapp|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest|googlebot|bingbot/i

const APP_URL = 'https://app.lagioianeldare.it'

function escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildOgHtml({ title, description, imageUrl, pageUrl, redirectUrl }) {
  const safeTitle = escape(title)
  const safeDesc = escape(description)
  const safeImage = escape(imageUrl)
  const safePage = escape(pageUrl)
  const imageTag = safeImage
    ? `<meta property="og:image" content="${safeImage}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `<meta name="twitter:card" content="summary" />`

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle} — La Gioia nel Dare</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${safePage}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:site_name" content="La Gioia nel Dare" />
  ${imageTag}
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta http-equiv="refresh" content="0;url=${escape(redirectUrl)}" />
</head>
<body>
  <p><a href="${escape(redirectUrl)}">${safeTitle}</a></p>
</body>
</html>`
}

exports.ogRenderer = onRequest(
  { region: 'europe-west1', maxInstances: 10 },
  async (req, res) => {
    const ua = req.headers['user-agent'] ?? ''
    const path = req.path // e.g. /e/EVENT_ID or /f/FORM_ID

    // Match /e/:eventId or /f/:formId
    const eventMatch = path.match(/^\/e\/([^/]+)$/)
    const formMatch = path.match(/^\/f\/([^/]+)$/)

    if (!eventMatch && !formMatch) {
      res.status(404).send('Not found')
      return
    }

    // For non-bot user agents fetch and serve the SPA index.html directly.
    // A 302 redirect back to the same path would loop because this rewrite
    // intercepts /e/** and /f/** before the SPA catch-all rule.
    if (!BOT_UA.test(ua)) {
      try {
        const spaRes = await fetch(`${APP_URL}/index.html`)
        const html = await spaRes.text()
        res.set('Content-Type', 'text/html; charset=utf-8')
        res.set('Cache-Control', 'no-store')
        res.status(200).send(html)
      } catch (_) {
        res.redirect(302, APP_URL)
      }
      return
    }

    try {
      let title = 'La Gioia nel Dare'
      let description = ''
      let imageUrl = ''
      let pageUrl = `${APP_URL}${path}`
      const redirectUrl = pageUrl

      if (eventMatch) {
        const eventId = eventMatch[1]
        const snap = await db.collection('events').doc(eventId).get()
        if (snap.exists) {
          const ev = snap.data()
          title = ev.title || title
          description = ev.description
            ? ev.description.slice(0, 200)
            : [ev.startDate, ev.location].filter(Boolean).join(' · ')
          imageUrl = ev.imageUrl || ''
        }
      } else {
        const formId = formMatch[1]
        const snap = await db.collection('forms').doc(formId).get()
        if (snap.exists) {
          const form = snap.data()
          title = form.title || title
          description = form.description || form.cover?.subtitle || ''
          if (form.cover?.backgroundType === 'image') {
            imageUrl = form.cover?.imageUrl || ''
          }
        }
      }

      res.set('Cache-Control', 'public, max-age=300, s-maxage=300')
      res.status(200).send(buildOgHtml({ title, description, imageUrl, pageUrl, redirectUrl }))
    } catch (err) {
      logger.error('ogRenderer error', err)
      res.redirect(302, `${APP_URL}${path}`)
    }
  }
)
