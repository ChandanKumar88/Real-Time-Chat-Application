import axios from "axios";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL;

const API_BASE_URL =
  configuredBaseUrl ||
  (configuredBackendUrl ? `${configuredBackendUrl.replace(/\/$/, "")}/api` : "http://localhost:5000/api");

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("chat_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || "";
    const isSessionReplaced = error.response?.status === 401 && message.toLowerCase().includes("another active session");

    if (isSessionReplaced) {
      localStorage.removeItem("chat_token");
      window.dispatchEvent(new CustomEvent("quickchat:session-replaced", { detail: { message } }));
    }

    return Promise.reject(error);
  }
);
