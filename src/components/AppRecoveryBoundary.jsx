import React from 'react';
import {resetStoredCart} from '../services/cartStorage.js';

export default class AppRecoveryBoundary extends React.Component {
  state={failed:false,revision:0};
  static getDerivedStateFromError(){return {failed:true};}
  recoverCart=()=>{resetStoredCart();this.setState(state=>({failed:false,revision:state.revision+1}));};
  render(){
    if(this.state.failed)return <main role="alert" className="min-h-screen grid place-items-center bg-dark-950 p-6 text-white">
      <div className="max-w-md text-center space-y-5">
        <h1 className="font-serif text-2xl">Chưa mở được EMORIA</h1>
        <p className="text-slate-300">Vui lòng tải lại trang. Nếu lỗi vẫn còn, hãy khôi phục giỏ hàng trên thiết bị này.</p>
        <button className="store-button" onClick={()=>window.location.reload()}>Thử tải lại</button>
        <button className="store-button ml-3" onClick={this.recoverCart}>Khôi phục giỏ hàng</button>
        <p className="text-xs text-slate-400">Khôi phục giỏ hàng giữ phiên đăng nhập và yêu cầu đặt hàng đang chờ.</p>
      </div>
    </main>;
    return <React.Fragment key={this.state.revision}>{this.props.children}</React.Fragment>;
  }
}
