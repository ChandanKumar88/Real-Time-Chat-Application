import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://quickchat-zlgq.onrender.com";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("chat_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
https://quickchat-zlgq.onrender.com