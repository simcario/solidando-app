import type { FormVariable, FormNode } from '../types/form'

/**
 * Sostituisce {{nomeVariabile}} e {{idCampo}} in un testo con i valori attuali.
 * - variabili: cercate per nome
 * - campi: cercati per id (fallback label se risposta assente)
 * Testo invariato se la chiave non è riconosciuta.
 */
export function resolveTemplate(
  text: string,
  variables: FormVariable[],
  nodes: FormNode[],
  answers: Record<string, unknown> = {},
): string {
  if (!text || !text.includes('{{')) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim()

    // Cerca prima tra le variabili per nome
    const variable = variables.find(v => v.name === trimmed)
    if (variable !== undefined) {
      return `${variable.value}${variable.unit ? ' ' + variable.unit : ''}`
    }

    // Cerca tra i campi per id (valore risposta o label come fallback)
    const node = nodes.find(n => n.id === trimmed)
    if (node !== undefined) {
      const answer = answers[trimmed]
      if (answer !== undefined && answer !== '') return String(answer)
      return node.properties.label || trimmed
    }

    return match
  })
}
