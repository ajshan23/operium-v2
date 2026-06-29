import { apiClient, API_BASE_URL } from "./client";
import { setToken, setUser, removeToken, removeUser } from "@/lib/auth";

async function saveSessionFromResponse(res: any) {
  const data = res?.data;
  if (data?.token) {
    setToken(data.token);
  }
  if (data?.userId) {
    setUser({
      userId: data.userId,
      email:  data.email  ?? "",
      name:   data.name   ?? null,
      avatar: data.avatar ?? null,
    });
  }
}

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiClient("/api/auth/login", { data: { email, password } });
    await saveSessionFromResponse(res);
    return res;
  },

  register: async (name?: string, email?: string, password?: string) => {
    return apiClient("/api/auth/register", { data: { name, email, password } });
  },

  verifyOtp: async (email: string, otp: string) => {
    const res = await apiClient("/api/auth/verify-otp", { data: { email, otp } });
    await saveSessionFromResponse(res);
    return res;
  },

  resendOtp: async (email: string) => {
    return apiClient("/api/auth/resend-otp", { data: { email } });
  },

  googleLogin: async (idToken: string) => {
    const res = await apiClient("/api/auth/google", { data: { idToken } });
    await saveSessionFromResponse(res);
    return res;
  },

  logout: async () => {
    try {
      await apiClient("/api/auth/logout", { method: "POST" });
    } finally {
      removeToken();
      removeUser();
    }
  },

  getGithubLoginUrl: () => {
    return `${API_BASE_URL}/api/auth/github`;
  },
};
