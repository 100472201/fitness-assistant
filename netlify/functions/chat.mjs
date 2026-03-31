// netlify/functions/chat.mjs

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const { messages, day_label } = JSON.parse(event.body || '{}');
    const systemPrompt = buildSystemPrompt(day_label);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!geminiApiKey && !openrouterApiKey) {
      return jsonResponse(500, {
        error: 'Falta configurar GEMINI_API_KEY o OPENROUTER_API_KEY en Netlify'
      });
    }

    let geminiError = null;
    let openrouterError = null;

    // 1) Intentar primero con Gemini
    if (geminiApiKey) {
      console.log('[Gemini] Intentando conectar con Gemini...');
      try {
        const geminiResult = await callGemini({
          apiKey: geminiApiKey,
          systemPrompt,
          dayLabel: day_label,
          messages
        });

        return jsonResponse(200, {
          choices: [
            {
              message: {
                content: geminiResult.text
              }
            }
          ],
          used_model: geminiResult.model,
          provider: 'gemini'
        });
      } catch (err) {
        geminiError = err.message || 'Error desconocido en Gemini';
        console.error('[Gemini] Error:', geminiError);
      }
    }

    // 2) Fallback a OpenRouter
    if (openrouterApiKey) {
      console.log('[OpenRouter] Fallback activado...');
      try {
        const openrouterResult = await callOpenRouter({
          apiKey: openrouterApiKey,
          systemPrompt,
          dayLabel: day_label,
          messages
        });

        return jsonResponse(200, {
          ...openrouterResult,
          provider: 'openrouter'
        });
      } catch (err) {
        openrouterError = err.message || 'Error desconocido en OpenRouter';
        console.error('[OpenRouter] Error:', openrouterError);
      }
    }

    // 3) Error final controlado
    return jsonResponse(503, {
      error: 'No se pudo obtener respuesta del modelo',
      gemini_error: geminiError,
      openrouter_error: openrouterError,
      suggestion: 'Reintenta en 30-60 segundos. Si ocurre a menudo, revisa cuota de Gemini y límites de OpenRouter.'
    });

  } catch (error) {
    return jsonResponse(500, {
      error: error.message || 'Error interno en la función Serverless'
    });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function buildSystemPrompt(dayLabel) {
  return `
Eres un asistente de entrenamiento.
Responde en español.
Sé breve, directo y útil.

Reglas:
- Máximo 2 frases.
- Da primero la recomendación.
- Luego una razón breve.
- No repitas el contexto.
- No uses introducciones.
- No uses tono de chatbot.
- DÍA ACTUAL: ${dayLabel}
  `.trim();
}

async function callGemini({ apiKey, systemPrompt, dayLabel, messages }) {
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  const contents = convertChatHistoryToGeminiContents(messages);

  const body = {
    systemInstruction: {
      parts: [
        {
          text: `${systemPrompt}\n\nDÍA ACTUAL: ${dayLabel}`
        }
      ]
    },
    contents,
    generationConfig: {
      temperature: 0.2
    }
  };

  let lastError = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`[Gemini] Probando modelo: ${model}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error?.message || `Gemini HTTP ${response.status}`;
        lastError = `${model}: ${message}`;
        continue;
      }

      const text = extractGeminiText(data);

      if (!text) {
        lastError = `${model}: Gemini no devolvió texto utilizable`;
        continue;
      }

      return { text, model };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = `${model}: ${err.message}`;
    }
  }

  throw new Error(lastError || 'Gemini falló con todos los modelos candidatos');
}


function convertChatHistoryToGeminiContents(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];

  return safeMessages
    .filter(msg => msg && typeof msg.content === 'string' && msg.content.trim())
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
}

function extractGeminiText(data) {
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map(part => part?.text || '')
    .join('')
    .trim();
}

async function callOpenRouter({ apiKey, systemPrompt, dayLabel, messages }) {
  const models = [
    'openrouter/free'
    //'z-ai/glm-4.5-air:free',
    //'stepfun/step-3.5-flash:free'
  ];

  let lastError = null;

  for (const model of models) {
    console.log(`[OpenRouter] Intentando conectar con modelo: ${model}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://trainos-fitness.netlify.app',
          'X-Title': 'TrainOS Fitness Assistant'
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 120,
          messages: [
            {
              role: 'system',
              content: `${systemPrompt}\n\nDÍA ACTUAL: ${dayLabel}`
            },
            ...(Array.isArray(messages) ? messages : [])
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = `${model}: ${data?.error?.message || `HTTP ${response.status}`}`;
        continue;
      }

      const text = extractOpenRouterText(data);

      if (!text) {
        console.log(
          '[OpenRouter] Respuesta 200 sin content final:',
          JSON.stringify({
            model: data?.model,
            finish_reason: data?.choices?.[0]?.finish_reason,
            has_reasoning: Boolean(data?.choices?.[0]?.message?.reasoning),
            has_content: Boolean(data?.choices?.[0]?.message?.content)
          }, null, 2)
        );

        const finishReason = data?.choices?.[0]?.finish_reason;

        if (finishReason === 'length') {
          return {
            choices: [
              {
                message: {
                  content: 'No pude generar una respuesta completa a tiempo. Prueba a reformular la petición de forma más corta.'
                }
              }
            ],
            used_model: model
          };
        }

        lastError = `${model}: respuesta sin contenido final`;
        continue;
      }

      return {
        choices: [
          {
            message: {
              content: text
            }
          }
        ],
        used_model: model
      };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = `${model}: ${err.name === 'AbortError' ? 'timeout' : err.message}`;
    }
  }

  throw new Error(lastError || 'Todos los modelos de OpenRouter fallaron');
}

function extractOpenRouterText(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message;

  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  if (Array.isArray(message?.content)) {
    const joined = message.content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();

    if (joined) return joined;
  }

  if (typeof choice?.text === 'string' && choice.text.trim()) {
    return choice.text.trim();
  }

  return '';
}

function buildJsonPrompt(dayLabel) {
  return `
Eres un asistente de entrenamiento.
Devuelve SOLO JSON válido con esta forma:
{
  "message": "string",
  "decision": "string",
  "score": number
}

Reglas:
- "message" máximo 120 caracteres.
- Español.
- Directo.
- DÍA ACTUAL: ${dayLabel}
  `.trim();
}