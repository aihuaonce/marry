import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import Main from './Main'; // 改為引入 Main.js，這樣可以處理路由
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Main /> {/* 使用 Main 組件來渲染路由 */}
  </React.StrictMode>
);

// 如果你想在應用程式中測量效能，請傳入一個函式
// 來記錄結果（例如: reportWebVitals(console.log)）
// 或發送到分析端點。了解更多：https://bit.ly/CRA-vitals
reportWebVitals();
