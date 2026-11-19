// Gemini'ga BRAUZERDAN murojaat qilish yadrosi (import'siz, sof funksiyalar —
// Node'da ham test qilinadi).
//
// Nega: do'kon serveri Gemini qo'llamaydigan hududda (Rossiya) bo'lsa,
// so'rovlar kassirning brauzeridan (O'zbekiston) to'g'ridan-to'g'ri
// Google'ga ketadi. Server esa `/ai/context` (ko'rsatma + vositalar) va
// `/ai/tools/run` (bazadan ma'lumot) beradi. Oqim serverdagi
// ai.controller.chat bilan bir xil.

/** Google javobidagi xatoni odam tiliga o'girish */
export function geminiErrorMessage(status, data, text) {
  const errObj = (Array.isArray(data) ? data?.[0]?.error : data?.error) || null
  const gm = errObj?.message || (text || '').slice(0, 300) || `HTTP ${status}`
  if (/location is not supported/i.test(gm)) return 'Gemini bu joylashuvdan ishlamaydi (User location is not supported).'
  if (status === 400 && /API key|api_key/i.test(gm)) return "Gemini API kaliti noto'g'ri"
  if (status === 401 || status === 403) return 'Gemini API kaliti rad etildi'
  if (status === 404) return 'Model topilmadi. Sozlamalarda boshqa modelni tanlang'
  if (status === 429) return "Gemini limiti tugadi (429). Bir ozdan keyin urinib ko'ring"
  return `Gemini xatosi (${status}): ${gm}`
}

/** Bitta so'rov. opts: { apiKey, endpoint, fetchImpl, timeoutMs } */
export async function geminiInteract(body, { apiKey, endpoint, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res, text
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    text = await res.text()
  } catch (e) {
    const err = new Error(e?.name === 'AbortError' ? 'Gemini javob bermadi (vaqt tugadi)' : `Gemini bilan aloqa yo'q: ${e?.message || e}`)
    err.network = true
    throw err
  } finally { clearTimeout(timer) }
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* matn */ }
  if (!res.ok) {
    const err = new Error(geminiErrorMessage(res.status, data, text))
    err.status = res.status
    err.raw = (Array.isArray(data) ? data?.[0]?.error : data?.error) || null
    throw err
  }
  return data
}

export const extractText  = (steps = []) => steps.filter(s => s?.type === 'model_output')
  .flatMap(s => (s.content || []).filter(c => c?.type === 'text').map(c => c.text)).join('\n').trim()
export const extractCalls = (steps = []) => steps.filter(s => s?.type === 'function_call' && s.name)
export function extractAudio(steps = []) {
  for (const s of steps) if (s?.type === 'model_output')
    for (const c of s.content || []) if (c?.type === 'audio' && c.data) return { mime: c.mime_type || 'audio/wav', data: c.data }
  return null
}

/** Javobning birinchi qatoridan "Siz: «...»" transkriptini ajratish (serverdagi bilan bir xil) */
export function splitTranscript(text) {
  const m = String(text || '').match(/^\s*Siz\s*:\s*(.+?)\s*(?:\n|$)/i)
  if (!m) return { text, transcript: null }
  const transcript = m[1].replace(/^[«"“'‘\s]+/, '').replace(/[»"”'’\s]+$/, '').trim()
  return { text: text.slice(m[0].length).trim(), transcript }
}

/** Matn → ovoz. Avval mp3, bo'lmasa wav. */
export async function geminiSynthesize(text, { apiKey, endpoint, model, voice, fetchImpl } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 900)
  if (!clean) return null
  const base = {
    model, store: false,
    input: [{ type: 'user_input', content: [{ type: 'text', text: clean }] }],
    generation_config: { speech_config: [{ voice: voice || 'Kore' }] },
  }
  let data
  try {
    data = await geminiInteract({ ...base, response_format: { type: 'audio', mime_type: 'audio/mp3' } }, { apiKey, endpoint, fetchImpl, timeoutMs: 45000 })
  } catch (e) {
    if (e.network || e.status === 429 || e.status === 401 || e.status === 403) throw e
    data = await geminiInteract({ ...base, response_format: { type: 'audio' } }, { apiKey, endpoint, fetchImpl, timeoutMs: 45000 })
  }
  return extractAudio(data?.steps)
}

/**
 * Suhbat sikli (brauzer rejimi).
 * cfg:   { apiKey, endpoint, model, thinking, systemInstruction, tools }
 * input: { text?, audio?: {mime,data}, history?: [{role,text}] }
 * runTool(name, args) → { result, actions }
 * Natija serverdagi /ai/chat bilan bir xil: { text, transcript, actions, tools }
 */
export async function geminiChat(cfg, { text = '', audio = null, history = [] }, runTool, { fetchImpl } = {}) {
  const parts = []
  const t = String(text || '').trim().slice(0, 4000)
  if (t) parts.push({ type: 'text', text: t })
  if (audio?.data) {
    if (!t) parts.push({ type: 'text', text: 'Ovozli xabar. Avval "Siz: «...»" qatorini yoz, keyin javob ber.' })
    parts.push({ type: 'audio', mime_type: audio.mime || 'audio/wav', data: audio.data })
  }
  if (!parts.length) throw new Error("Savol bo'sh")

  const input = (history || []).slice(-12).flatMap(h => {
    const tx = String(h?.text || '').trim().slice(0, 2000)
    if (!tx) return []
    return h.role === 'assistant'
      ? [{ type: 'model_output', content: [{ type: 'text', text: tx }] }]
      : [{ type: 'user_input', content: [{ type: 'text', text: tx }] }]
  })
  input.push({ type: 'user_input', content: parts })

  const actions = [], used = []
  let thinking = cfg.thinking || 'low'
  let finalText = ''
  for (let i = 0; i < 6; i++) {
    const body = {
      model: cfg.model, store: false,
      system_instruction: cfg.systemInstruction,
      input, tools: cfg.tools,
      generation_config: { max_output_tokens: 1500, ...(thinking ? { thinking_level: thinking } : {}) },
    }
    let data
    try {
      data = await geminiInteract(body, { apiKey: cfg.apiKey, endpoint: cfg.endpoint, fetchImpl })
    } catch (e) {
      if (thinking && e.status === 400 && /thinking/i.test(e.message)) { thinking = null; i--; continue }
      throw e
    }
    const steps = data?.steps || []
    const calls = extractCalls(steps)
    finalText = extractText(steps) || finalText
    if (!calls.length) break
    input.push(...steps)
    for (const c of calls) {
      used.push(c.name)
      let r
      try { r = await runTool(c.name, c.arguments || {}) }
      catch (e) { r = { result: { xato: `Vosita bajarilmadi: ${e?.response?.data?.message || e.message}` }, actions: [] } }
      for (const a of r?.actions || []) actions.push(a)
      input.push({ type: 'function_result', call_id: c.id, name: c.name, result: [{ type: 'text', text: JSON.stringify(r?.result ?? r) }] })
    }
  }
  let transcript = null
  if (audio) ({ text: finalText, transcript } = splitTranscript(finalText))
  if (!finalText) finalText = used.length ? "Ma'lumot olindi, lekin xulosa yozilmadi. Qayta so'rab ko'ring." : "Javob tayyorlay olmadim. Qayta so'rab ko'ring."
  return { text: finalText, transcript, actions, tools: [...new Set(used)] }
}
