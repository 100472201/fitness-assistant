import { GoogleGenerativeAI } from "@google/generative-ai";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { messages, systemPrompt } = JSON.parse(event.body);
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  // 1. Intentar con Gemini
  if (GEMINI_API_KEY) {
    try {
      console.log("Intentando con Gemini...");
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt 
      });

      // Convertir historial al formato de Gemini
      const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });

      const lastMessage = messages[messages.length - 1].content;
      const result = await chat.sendMessage(lastMessage);
      const responseText = result.response.text();

      return {
        statusCode: 200,
        body: JSON.stringify({ content: responseText, source: "gemini" }),
      };
    } catch (error) {
      console.error("Error en Gemini:", error);
      // Continuar al fallback de OpenRouter
    }
  }

  // 2. Fallback a OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      console.log("Fallback a OpenRouter...");
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://trainos-fitness.netlify.app",
          "X-Title": "TrainOS Fitness Assistant",
        },
        body: JSON.stringify({
          model: "mistralai/mistral-7b-instruct:free", // O cualquier otro modelo de fallback
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
        }),
      });

      const data = await response.json();
      const responseText = data.choices[0].message.content;

      return {
        statusCode: 200,
        body: JSON.stringify({ content: responseText, source: "openrouter" }),
      };
    } catch (error) {
      console.error("Error en OpenRouter:", error);
    }
  }

  return {
    statusCode: 500,
    body: JSON.stringify({ error: "No se pudo conectar con ninguna IA" }),
  };
};
