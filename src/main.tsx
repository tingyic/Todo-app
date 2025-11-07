import { createRoot } from "react-dom/client";
import App from "./components/App";
import "./App.css"
import "./index.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
