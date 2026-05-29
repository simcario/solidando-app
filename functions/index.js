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

async function runFormActions(responseData, formId, skipEmailActions, responseId = '') {
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

  // Conferma compilatore via template workspace (solo se pagamento non pending)
  if (!hasNotifyAction && emailTemplates.submitterConfirmation) {
    if (skipEmailActions) {
      logger.info('workspace submitterConfirmation: skipped — payment pending')
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
  const paymentPending = hasPaymentNode && response.paymentStatus !== 'completed'

  await runFormActions(response, formId, paymentPending, event.params.responseId)

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

  const { responseId } = request.data
  if (!responseId) throw new HttpsError('invalid-argument', 'responseId obbligatorio')

  const ref = db.doc(`responses/${responseId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Risposta non trovata')

  const data = snap.data()
  if (data.checkInStatus === 'checked_in') {
    return { alreadyCheckedIn: true, checkInAt: data.checkInAt?.toDate?.().toISOString() ?? null }
  }

  await ref.update({
    checkInStatus: 'checked_in',
    checkInAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  logger.info(`checkIn: responseId=${responseId} uid=${request.auth.uid}`)
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
