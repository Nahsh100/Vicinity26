import { create } from 'zustand';
import type { AuthTokens, CurrentUser, LoginInput, RegisterInput } from '@vicinity/shared';
import { api, refreshSession, tokens } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { unregisterPush } from '@/lib/push';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: CurrentUser | null;
  bootstrap(): Promise<void>;
  login(input: LoginInput): Promise<CurrentUser>;
  register(input: RegisterInput): Promise<CurrentUser>;
  /** Phone sign-in: verifies the SMS code; `isNewUser` means the account was just created. */
  loginWithPhone(phone: string, code: string): Promise<{ user: CurrentUser; isNewUser: boolean }>;
  logout(): Promise<void>;
  refreshUser(): Promise<CurrentUser | null>;
  setUser(u: CurrentUser): void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  /** Restores the session from the stored refresh token. Works offline-tolerant: a network error keeps the user signed out of API calls but not logged out. */
  async bootstrap() {
    tokens.onSessionEnded(() => {
      set({ status: 'signedOut', user: null });
      queryClient.clear();
    });
    const t = await refreshSession();
    if (!t) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const user = await api.get<CurrentUser>('/auth/me');
      set({ status: 'signedIn', user });
    } catch {
      set({ status: 'signedOut', user: null });
    }
  },

  async login(input) {
    const r = await api.post<{ tokens: AuthTokens; user: CurrentUser }>('/auth/login', input);
    await tokens.save(r.tokens);
    queryClient.clear();
    set({ status: 'signedIn', user: r.user });
    return r.user;
  },

  async register(input) {
    const r = await api.post<{ tokens: AuthTokens; user: CurrentUser }>('/auth/register', input);
    await tokens.save(r.tokens);
    queryClient.clear();
    set({ status: 'signedIn', user: r.user });
    return r.user;
  },


  async loginWithPhone(phone, code) {
    const r = await api.post<{ tokens: AuthTokens; user: CurrentUser; isNewUser: boolean }>('/auth/phone/verify', { phone, code });
    await tokens.save(r.tokens);
    queryClient.clear();
    set({ status: 'signedIn', user: r.user });
    return { user: r.user, isNewUser: r.isNewUser };
  },
  async logout() {
    const rt = await tokens.getRefresh();
    await unregisterPush().catch(() => undefined);
    await api.post('/auth/logout', { refreshToken: rt ?? undefined }).catch(() => undefined);
    await tokens.clear();
    queryClient.clear();
    set({ status: 'signedOut', user: null });
  },

  async refreshUser() {
    if (get().status !== 'signedIn') return null;
    const user = await api.get<CurrentUser>('/auth/me');
    set({ user });
    return user;
  },

  setUser(user) {
    set({ user });
  },
}));
