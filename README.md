# TrainOS Fitness Assistant 🚀

**TrainOS** es un asistente de fitness inteligente impulsado por IA diseñado para planificar, registrar y optimizar tus entrenamientos semanales desde una interfaz web premium.

---

## ✨ Características Principales

- **🤖 IA Activa & Fallback:** Integración nativa con **Google Gemini 2.0/1.5** para coaching inteligente. Si falla, el sistema conmuta automáticamente a **OpenRouter** para garantizar disponibilidad.
- **📅 Planificador Semanal:** Calendario interactivo para registrar sesiones de Empuje (Push), Tirón (Pull), Piernas (Legs), Running, Escalada y más.
- **🧠 Memoria Semanal:** El asistente tiene acceso a todo lo que has registrado durante la semana actual en `localStorage`, permitiendo ajustes precisos basados en tu fatiga y volumen real.
- **🖥️ UI "Premium PC":** Interfaz expansiva optimizada para monitores de escritorio con:
  - Efectos de **Glassmorphism** y difuminado de fondo.
  - Tipografía **Inter** de alta legibilidad.
  - Layout de chat centrado de **1200px** para una lectura cómoda.
  - Barras de desplazamiento personalizadas de alta visibilidad.
- **⚡ Rendimiento:** Construido con **React + Vite** y desplegado con **Netlify Functions** para un backend serverless seguro.

## 🛠️ Requisitos & Configuración

El proyecto requiere claves de API para los servicios de IA:

1. Clona el repositorio.
2. Crea un archivo `.env` en la raíz (o configura variables en Netlify):
   ```env
   GEMINI_API_KEY=tu_clave_aqui
   OPENROUTER_API_KEY=tu_clave_aqui (opcional)
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```

## 🚀 Desarrollo Local

Para ejecutar el proyecto con las funciones de backend (Netlify Functions):

```bash
npx netlify dev
```

Esto levantará el servidor de desarrollo en `http://localhost:8888`.

---
*Optimiza tu entrenamiento. Domina tu semana. Entrena con TrainOS.*
