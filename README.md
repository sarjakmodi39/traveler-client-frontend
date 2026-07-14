# Traveler Client Frontend Portal
**Multi-Agent Collaborative Trip Planner Dashboard**

This is the frontend client dashboard for the Multi-Agent Trip Planner, built with **React 18**, **TypeScript**, and **Vite**. It provides a sleek, responsive, glassmorphic UI where travelers can plan custom trips and platform administrators can inspect agent execution traces.

---

## 🎨 User Interface & Key Features
* **Standard Traveler View**: A premium, dark-themed trip planning portal.
  * Natural language prompt submissions.
  * Real-time **Visual Concurrency Stepper** illustrating pipeline trace executions.
  * Cost validation results showing **Self-Correction Loops** (e.g. refactoring stays when the budget is exceeded).
  * Dynamic **Confidence Score** card based on constraint matching and logistical uncertainties.
* **Platform Auditor & Observer Portal**: A dedicated administration dashboard.
  * Direct table view of previous trip request database entries.
  * Step-by-step audit logs showing the exact **prompt input** and **JSON output** for each agent.
  * Observability metrics including execution durations (in ms) and the model used (e.g. `gemini-3.1-flash-lite`).

---

## 🛠️ Technology Stack
* **Framework**: React 18 & TypeScript
* **Build Tool**: Vite
* **Styling**: Vanilla CSS (CSS Variables, Flexbox, CSS Grid)
* **Icons**: `lucide-react`

---

## 🚀 Getting Started

### 1. Install Dependencies
Navigate to the frontend folder and install the packages:
```bash
npm install
```

### 2. Configure API Endpoint
The frontend client communicates with the backend Express service. By default, it calls:
* **Backend API**: `http://localhost:5000`

Ensure the backend server is running concurrently.

### 3. Run the Client
Start the Vite local development server:
```bash
npm run dev
```
The application will be accessible at **`http://localhost:5173`**.

---

## 📊 Directory Structure
* `src/App.tsx`: Main application file containing state management, routing, auditor view, and JSX templates.
* `src/App.css`: Custom styling containing grid systems, glassmorphism templates, animations, and color palettes.
* `src/main.tsx`: Entrypoint registering React nodes.
