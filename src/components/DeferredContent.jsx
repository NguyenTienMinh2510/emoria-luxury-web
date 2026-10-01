import React, { Suspense } from 'react';

// Keep navigation available when an on-demand chunk cannot be downloaded.
export default class DeferredContent extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div role="alert" className="p-8 text-center text-slate-200">
        <p>Chưa tải được phần này. Vui lòng thử lại.</p>
        <button className="mt-4 rounded-xl bg-white px-5 py-3 text-black" onClick={() => window.location.reload()}>Thử tải lại</button>
      </div>
    );
    return <Suspense fallback={this.props.fallback ?? <div role="status" className="min-h-[60vh] flex items-center justify-center text-slate-300">Đang mở EMORIA…</div>}>{this.props.children}</Suspense>;
  }
}
