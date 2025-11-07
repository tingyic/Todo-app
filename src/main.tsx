import { createRoot } from "react-dom/client";
import App from "./components/App";
import "./index.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
