import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Lock, Mail, CheckCircle2, ArrowRight, Sparkles, AlertCircle, LogOut } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export default function AuthModal({ isOpen, onClose, onLoginSuccess, currentUser }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const formatEmail = (input) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    return `${trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@emoria.vn`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError('');

    const targetEmail = email ? email.trim() : formatEmail(username);

    if (isSupabaseConfigured()) {
      try {
        if (isLogin) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password,
          });

          if (error) {
            if (error.message.includes('Invalid login credentials')) {
              throw new Error('Email hoặc mật khẩu không chính xác.');
            }
            throw new Error(error.message);
          }

          setSubmitted(true);
          const name = data.user?.user_metadata?.full_name || username || 'Thành viên EMORIA VIP';
          if (onLoginSuccess) onLoginSuccess(name);

          setTimeout(() => {
            setSubmitted(false);
            onClose();
          }, 1200);
        } else {
          // Sign Up
          const { data, error } = await supabase.auth.signUp({
            email: targetEmail,
            password,
            options: {
              data: {
                full_name: fullName || username,
                username: username,
              },
            },
          });

          if (error) {
            if (error.message.includes('User already registered')) {
              throw new Error('Email này đã được đăng ký.');
            }
            if (error.message.includes('Password should be at least')) {
              throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');
            }
            throw new Error(error.message);
          }

          setSubmitted(true);
          const name = fullName || username || 'Thành viên EMORIA VIP';
          if (onLoginSuccess) onLoginSuccess(name);

          setTimeout(() => {
            setSubmitted(false);
            onClose();
          }, 1200);
        }
      } catch (err) {
        setAuthError(err.message || 'Lỗi đăng nhập/đăng ký.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Offline fallback
      setTimeout(() => {
        setIsSubmitting(false);
        setSubmitted(true);
        if (onLoginSuccess) {
          onLoginSuccess(fullName || username || 'Thành viên EMORIA VIP');
        }
        setTimeout(() => {
          setSubmitted(false);
          onClose();
        }, 1200);
      }, 700);
    }
  };

  const handleSignOut = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    if (onLoginSuccess) onLoginSuccess(null);
    onClose();
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-sm rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <span className="font-serif text-2xl font-bold tracking-[0.2em] text-metallic">
              EMORIA
            </span>
            <h3 className="text-lg font-serif font-bold text-white mt-2">
              {currentUser
                ? `Xin chào, ${currentUser}`
                : isLogin
                ? 'Đăng Nhập Thành Viên'
                : 'Đăng Ký Tài Khoản'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {currentUser
                ? 'Đã kết nối với Supabase Memory Cloud'
                : 'Quản lý Memory Space &amp; Trang Sức Đã Sở Hữu'}
            </p>
          </div>

          {currentUser ? (
            <div className="py-4 space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-slate-200">
                <User className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-white">{currentUser}</p>
              <button
                onClick={handleSignOut}
                className="w-full h-11 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng Xuất Tài Khoản</span>
              </button>
            </div>
          ) : submitted ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              <p className="text-sm font-semibold text-emerald-300">
                {isLogin ? 'Đăng nhập thành công!' : 'Đăng ký thành công!'}
              </p>
              <p className="text-xs text-slate-400">Đang đồng bộ hóa Memory Space...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {authError && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {!isLogin && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 ml-2">Họ và tên</label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 ml-2">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="member@emoria.vn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-300 ml-2">
                  {isLogin ? 'Email hoặc Tên đăng nhập' : 'Tên đăng nhập'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isLogin ? 'member@emoria.vn hoặc emoria_user' : 'emoria_user'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 ml-2">Mật khẩu</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 mt-2 rounded-xl bg-gradient-to-r from-slate-200 via-white to-slate-300 text-dark-950 font-bold text-sm shadow-silver-glow hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? 'Đăng Nhập' : 'Tạo Tài Khoản'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setAuthError('');
                  }}
                  className="text-xs text-slate-400 hover:text-white underline transition-colors cursor-pointer"
                >
                  {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
