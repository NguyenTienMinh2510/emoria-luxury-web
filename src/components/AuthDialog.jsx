import React, { useState, useEffect } from 'react';
import { 
  User, 
  Package, 
  Key, 
  ShieldCheck, 
  Calendar, 
  Phone, 
  MapPin, 
  Mail, 
  Sparkles, 
  Check, 
  AlertCircle, 
  LogOut,
  Image as ImageIcon,
  Edit3,
  CheckCircle2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { getMyProfile, updateMyProfile } from '../services/profileService';
import ModalFrame from './ModalFrame';
import CustomerOrders from './CustomerOrders';

export default function AuthDialog({ 
  isOpen, 
  onClose, 
  onLoginSuccess, 
  currentUser, 
  recovery = false, 
  initialMode = 'login' 
}) {
  // Auth Modes: 'login' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Logged-in Navigation Tabs: 'profile' | 'orders' | 'security'
  const [activeTab, setActiveTab] = useState('profile');

  // Profile Form States
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const [fullName, setFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Security Form States (Change Password)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');

  // General Auth Form States
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Reset or init on open
  useEffect(() => {
    if (isOpen) {
      setMode(recovery ? 'reset' : initialMode);
      setError('');
      setMessage('');
      setPassword('');
      setSecurityError('');
      setSecurityMessage('');
      setProfileSuccess('');
      setProfileError('');

      if (currentUser && mode !== 'reset') {
        loadUserProfile();
      }
    }
  }, [isOpen, recovery, initialMode, currentUser]);

  const loadUserProfile = async () => {
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await getMyProfile();
      if (res.success && res.profile) {
        const p = res.profile;
        setFullName(p.full_name || '');
        setUserEmail(p.email || '');
        setPhone(p.phone || '');
        // format birthday to YYYY-MM-DD for date input
        if (p.birthday) {
          const d = new Date(p.birthday);
          if (!isNaN(d.getTime())) {
            setBirthday(d.toISOString().split('T')[0]);
          } else {
            setBirthday(p.birthday);
          }
        } else {
          setBirthday('');
        }
        setGender(p.gender || '');
        setAddress(p.address || '');
        setBio(p.bio || '');
        setAvatarUrl(p.avatar_url || '');
      }
    } catch (err) {
      console.warn('Lỗi tải hồ sơ:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  if (!isOpen) return null;

  // Handle Save Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (profileSaving) return;

    setProfileSaving(true);
    setProfileSuccess('');
    setProfileError('');

    try {
      if (phone && !/^[0-9+ ]{8,15}$/.test(phone.trim())) {
        throw new Error('Số điện thoại không hợp lệ (từ 8 đến 15 chữ số).');
      }

      const res = await updateMyProfile({
        fullName,
        phone,
        birthday,
        gender,
        address,
        bio,
        avatarUrl,
      });

      if (!res.success) {
        throw new Error(res.message || 'Không thể lưu hồ sơ.');
      }

      setProfileSuccess('✓ Cập nhật hồ sơ tài khoản thành công!');
      // Update displayed name in parent App
      if (fullName.trim()) {
        onLoginSuccess?.(fullName.trim());
      }
    } catch (err) {
      setProfileError(err.message || 'Lỗi khi lưu thông tin hồ sơ.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Change Password (when logged in)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (securityBusy) return;

    if (newPassword.length < 8) {
      setSecurityError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSecurityBusy(true);
    setSecurityError('');
    setSecurityMessage('');

    try {
      const { error: pwdErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwdErr) throw pwdErr;

      setSecurityMessage('✓ Đã cập nhật mật khẩu mới thành công.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSecurityError(err.message || 'Không thể cập nhật mật khẩu.');
    } finally {
      setSecurityBusy(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      const { error: signErr } = await supabase.auth.signOut();
      if (signErr) throw signErr;
      onLoginSuccess?.(null);
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi đăng xuất.');
    }
  };

  // Handle Login / Register / Forgot
  const submitAuth = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Chưa kết nối máy chủ Supabase.');
      }

      const redirectTo = new URL('/?auth=recovery', window.location.origin).href;

      if (mode === 'forgot') {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (resetErr) throw resetErr;
        setMessage('Nếu email đã đăng ký, liên kết đặt lại mật khẩu sẽ được gửi đến hòm thư của bạn.');
      } else if (mode === 'reset') {
        const { data, error: updateErr } = await supabase.auth.updateUser({ password });
        if (updateErr) throw updateErr;
        setMessage('Đã đổi mật khẩu thành công.');
        setPassword('');
        setMode('login');
        onLoginSuccess?.(data.user.user_metadata?.full_name || data.user.email);
      } else if (mode === 'register') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpErr) throw signUpErr;

        if (data.session) {
          onLoginSuccess?.(data.user.user_metadata?.full_name || data.user.email);
          onClose();
        } else {
          setMessage('Hãy mở email để xác minh và kích hoạt tài khoản của bạn.');
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;

        onLoginSuccess?.(data.user.user_metadata?.full_name || data.user.email);
        setPassword('');
        onClose();
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Email hoặc mật khẩu không đúng.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  // Render Logged-In Profile Dashboard
  if (currentUser && mode !== 'reset') {
    const initials = (fullName || currentUser || 'E')
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0].toUpperCase())
      .join('');

    return (
      <ModalFrame title="Tài Khoản & Hồ Sơ Emoria" onClose={onClose} wide={true}>
        {/* Navigation Tabs Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-4 mb-6 gap-3">
          <div className="flex items-center gap-1 sm:gap-2 bg-black/40 p-1 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { setActiveTab('profile'); setProfileSuccess(''); setProfileError(''); }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'profile'
                  ? 'bg-white text-dark-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Hồ sơ cá nhân</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('orders'); }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'orders'
                  ? 'bg-white text-dark-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Đơn hàng</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('security'); setSecurityMessage(''); setSecurityError(''); }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-white text-dark-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Đổi mật khẩu</span>
            </button>
          </div>

          {/* Quick Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>

        {/* TAB 1: HỒ SƠ CÁ NHÂN */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* User Overview Banner */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-white/5 to-white/[0.02] border border-white/10">
              {/* Avatar display with preview */}
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-amber-400/50 shadow-lg"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 text-dark-950 flex items-center justify-center font-serif text-xl sm:text-2xl font-bold shadow-lg">
                    {initials}
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h3 className="font-serif text-lg sm:text-xl text-white font-semibold">
                    {fullName || currentUser}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 w-fit mx-auto sm:mx-0">
                    <ShieldCheck className="w-3 h-3" /> Thành viên EMORIA
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center justify-center sm:justify-start gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>{userEmail || currentUser}</span>
                </p>
                {bio && <p className="text-xs text-slate-300 italic pt-1 line-clamp-2">"{bio}"</p>}
              </div>
            </div>

            {/* Status alerts */}
            {profileSuccess && (
              <div role="status" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{profileSuccess}</span>
              </div>
            )}
            {profileError && (
              <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{profileError}</span>
              </div>
            )}

            {/* Profile Edit Form */}
            {profileLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                Đang tải thông tin hồ sơ...
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Họ và tên */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-300" />
                      <span>Họ và tên:</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Tiến Minh"
                      className="store-input w-full"
                    />
                  </div>

                  {/* Số điện thoại */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-amber-300" />
                      <span>Số điện thoại:</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ví dụ: 0912 345 678"
                      className="store-input w-full"
                    />
                  </div>

                  {/* Ngày tháng năm sinh */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-300" />
                      <span>Ngày tháng năm sinh:</span>
                    </label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="store-input w-full [color-scheme:dark]"
                    />
                  </div>

                  {/* Giới tính */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Giới tính:</span>
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="store-input w-full"
                    >
                      <option value="">-- Chọn giới tính --</option>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>
                </div>

                {/* Địa chỉ nhận hàng mặc định */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-300" />
                      <span>Địa chỉ nhận hàng mặc định:</span>
                    </label>
                    <span className="text-[10px] text-slate-400 italic">Tự động điền khi thanh toán</span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                    className="store-input w-full resize-none text-xs sm:text-sm"
                  />
                </div>

                {/* Ảnh đại diện URL */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                    <span>Đường dẫn ảnh đại diện (Avatar URL):</span>
                  </label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="store-input w-full text-xs"
                  />
                </div>

                {/* Tiểu sử / Ghi chú cá nhân */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ghi chú / Tiểu sử cá nhân:</span>
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Chia sẻ đôi dòng về bạn hoặc ngày kỷ niệm đặc biệt cần ghi nhớ..."
                    className="store-input w-full resize-none text-xs sm:text-sm"
                  />
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="store-button w-full sm:w-auto px-8 py-3 bg-white text-dark-950 font-bold hover:bg-slate-200 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {profileSaving ? (
                      <>
                        <span className="w-4 h-4 border-2 border-dark-950 border-t-transparent rounded-full animate-spin" />
                        <span>Đang lưu thông tin…</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Lưu Thay Đổi Hồ Sơ</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: ĐƠN HÀNG CỦA BẠN */}
        {activeTab === 'orders' && (
          <div>
            <CustomerOrders />
          </div>
        )}

        {/* TAB 3: BẢO MẬT & ĐỔI MẬT KHẨU */}
        {activeTab === 'security' && (
          <div className="space-y-4 max-w-md">
            <h4 className="font-serif text-lg text-white">Đổi mật khẩu tài khoản</h4>
            <p className="text-xs text-slate-400">
              Mật khẩu mới cần có tối thiểu 8 ký tự để đảm bảo an toàn cho dữ liệu kỷ vật và đơn hàng của bạn.
            </p>

            {securityMessage && (
              <div role="status" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{securityMessage}</span>
              </div>
            )}
            {securityError && (
              <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{securityError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Mật khẩu mới:</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="store-input w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Xác nhận mật khẩu mới:</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="store-input w-full"
                />
              </div>

              <button
                type="submit"
                disabled={securityBusy}
                className="store-button w-full py-2.5 text-sm"
              >
                {securityBusy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu mới'}
              </button>
            </form>
          </div>
        )}
      </ModalFrame>
    );
  }

  // Render Logged-Out Authentication Form
  return (
    <ModalFrame title="Tài khoản EMORIA" onClose={onClose}>
      {error && <p role="alert" className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-xl text-sm">{error}</p>}
      {message && <p role="status" className="p-3 mb-4 bg-emerald-500/10 text-emerald-200 rounded-xl text-sm">{message}</p>}

      <p className="text-slate-400 text-sm mb-5">
        {{
          login: 'Đăng nhập để quản lý hồ sơ, đơn hàng và kỷ vật.',
          register: 'Tạo tài khoản bằng email của bạn.',
          forgot: 'Nhận liên kết đặt lại mật khẩu.',
          reset: 'Nhập mật khẩu mới.',
        }[mode]}
      </p>

      <form onSubmit={submitAuth} className="space-y-4">
        {mode === 'register' && (
          <label className="store-label">
            Họ và tên
            <input
              required
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="store-input"
            />
          </label>
        )}

        {mode !== 'reset' && (
          <label className="store-label">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="store-input"
            />
          </label>
        )}

        {mode !== 'forgot' && (
          <label className="store-label">
            Mật khẩu
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="store-input"
            />
          </label>
        )}

        <button disabled={busy} className="store-button w-full">
          {busy
            ? 'Đang xử lý…'
            : {
                login: 'Đăng nhập',
                register: 'Đăng ký',
                forgot: 'Gửi liên kết',
                reset: 'Lưu mật khẩu mới',
              }[mode]}
        </button>
      </form>

      <div className="flex justify-between gap-3 text-sm mt-5">
        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setMessage('');
            setError('');
          }}
        >
          {mode === 'login' ? 'Tạo tài khoản' : 'Về đăng nhập'}
        </button>
        <button onClick={() => setMode('forgot')}>Quên mật khẩu?</button>
      </div>
    </ModalFrame>
  );
}
