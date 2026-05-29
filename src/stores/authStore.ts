import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { UserProfile } from '../types/form'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  profileLoaded: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: UserProfile | null) => void
  setLoading: (loading: boolean) => void
  setProfileLoaded: (loaded: boolean) => void
  // Atomic update: sets profile + profileLoaded + loading in a single render
  resolveAuth: (user: User | null, profile: UserProfile | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  profileLoaded: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setProfileLoaded: (loaded) => set({ profileLoaded: loaded }),
  resolveAuth: (user, profile) => set({ user, profile, profileLoaded: true, loading: false }),
}))
