import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import validator from 'validator'; // 引入 validator 函式庫
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FiMenu } from 'react-icons/fi'; // 引入漢堡選單圖示
import './App.css'

function App() {
  const [allCustomers, setAllCustomers] = useState([]); // 儲存從 API 獲取的原始客戶列表
  const [filteredCustomers, setFilteredCustomers] = useState([]); // 儲存篩選/拖曳後的客戶列表
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [error, setError] = useState(null); // 忽略 ESLint 警告


  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    groom_name: "",
    bride_name: "",
    email: "",
    phone: "",
    wedding_date: "", // 這裡儲存的是 datetime-local 的字串
    wedding_location: "", // 新增地點欄位到 state
    form_link: "",
  });

  const [formErrors, setFormErrors] = useState({}); // 使用物件來存儲多個欄位的錯誤
  const [isSubmitting, setIsSubmitting] = useState(false); // 新增狀態追蹤是否正在提交表單
  const [isDeleting, setIsDeleting] = useState(false); // 新增狀態追蹤是否正在刪除

  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'open', 'closed'
  const [isMenuOpen, setIsMenuOpen] = useState(false); // 控制漢堡選單開合

  // 新增狀態來管理提示訊息 { message: '...', type: 'success' | 'error' | null }
  const [notification, setNotification] = useState(null);

  // 新增狀態來管理刪除確認框
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null); // 儲存要刪除客戶的資訊 { id, name }
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState(''); // 儲存刪除確認輸入框的值
  const confirmationText = "確認刪除"; // 刪除確認需要的文字


  // 獲取客戶資料的函式
  const fetchCustomers = useCallback(async (status = 'all') => {
    setLoading(true);
    setError(null);
    let url = "http://localhost:5000/customers"; // 確保這是你的後端 API 地址
    if (status !== 'all') {
      url += `?status=${status}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("API request failed: " + res.statusText);
      const data = await res.json();
      setAllCustomers(data);
      // 根據當前篩選狀態更新 filteredCustomers
      if (status === 'all') {
        setFilteredCustomers(data);
      } else {
        setFilteredCustomers(data.filter(c => c.status === status));
      }
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("無法載入客戶資料，請稍後再試。");
      setAllCustomers([]);
      setFilteredCustomers([]);
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchCustomers(filterStatus);
  }, [fetchCustomers, filterStatus]);

  // 根據 filterStatus 更新 filteredCustomers (當 allCustomers 改變時)
  useEffect(() => {
    if (filterStatus === 'all') {
      setFilteredCustomers(allCustomers);
    } else {
      setFilteredCustomers(allCustomers.filter(c => c.status === filterStatus));
    }
  }, [allCustomers, filterStatus]);

  // 使用 useEffect 來自動隱藏提示訊息
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 秒後隱藏提示訊息

      return () => clearTimeout(timer); // 在 notification 改變或元件卸載時清除 timer
    }
  }, [notification]);


  // 表單驗證函式
  const validateForm = () => {
    const errors = {};
    if (!formData.groom_name.trim()) errors.groom_name = "請填寫新人姓名";
    if (!formData.bride_name.trim()) errors.bride_name = "請填寫新人姓名";
    if (!formData.email.trim()) {
      errors.email = "請填寫電子郵件地址";
    } else if (!validator.isEmail(formData.email)) {
      errors.email = "請輸入有效的電子郵件地址";
    }
    if (!formData.phone.trim()) errors.phone = "請填寫聯絡電話";
    // wedding_date 和 wedding_location 非必填，但可加入驗證
    if (!formData.form_link.trim()) {
      errors.form_link = "請填寫 Google 試算表連結";
    } else if (!validator.isURL(formData.form_link, { require_protocol: true })) {
      errors.form_link = "請輸入有效的連結 (包含 http:// 或 https://)";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formErrors[e.target.name]) {
      setFormErrors({ ...formErrors, [e.target.name]: "" });
    }
    if (formErrors.submit) {
      setFormErrors({ ...formErrors, submit: "" });
    }
  };

  const handleSubmit = async () => { // 改為 async 函式
    if (!validateForm()) { // 執行驗證
      return; // 驗證失敗，停止提交
    }

    setIsSubmitting(true); // 開始提交，設置狀態為 true
    setFormErrors({}); // 提交前清除錯誤

    try {
      const res = await fetch("http://localhost:5000/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 發送包含 wedding_location 的 formData
        body: JSON.stringify(formData),
      });

      const data = await res.json(); // 嘗試解析 JSON

      if (!res.ok) {
        // 根據後端返回的錯誤訊息來顯示
        const errorMessage = data.message || "新增失敗，請稍後再試";
        console.error("新增客戶 API 錯誤:", errorMessage);
        throw new Error(errorMessage);
      }

      // 新增成功後重新獲取客戶資料
      fetchCustomers(filterStatus);


      setShowForm(false);
      setFormData({
        groom_name: "",
        bride_name: "",
        email: "",
        phone: "",
        wedding_date: "",
        wedding_location: "", // 清空地點欄位
        form_link: "",
      });
      // 使用 setNotification 顯示成功訊息
      setNotification({ message: "客戶新增成功！", type: "success" });

    } catch (err) {
      console.error("新增錯誤：", err);
      // 顯示更友善的錯誤訊息
      setFormErrors({ ...formErrors, submit: err.message || "新增失敗，請稍後再試" }); // 將提交錯誤放在 submit 欄位
      // 使用 setNotification 顯示錯誤訊息
      setNotification({ message: err.message || "新增失敗，請稍後再試", type: "error" });
    } finally {
      setIsSubmitting(false); // 提交結束，設置狀態為 false
    }
  };


  // ==== 刪除客戶函式 (開啟確認框) ====
  const handleDeleteCustomer = (customerId, customerName) => {
    setCustomerToDelete({ id: customerId, name: customerName });
    setShowDeleteConfirm(true);
  };

  // ==== 處理刪除確認並執行刪除 API ====
  const confirmDelete = async () => {
    if (deleteConfirmationInput !== confirmationText) {
      setNotification({ message: "輸入不符，已取消刪除。", type: "error" });
      closeDeleteConfirmModal(); // 關閉確認框
      return;
    }

    setIsDeleting(true); // 開始刪除，設置狀態為 true

    try {
      const res = await fetch(`http://localhost:5000/customers/${customerToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json(); // 嘗試解析 JSON

      if (!res.ok) {
        const errorMessage = data.message || `刪除客戶 ${customerToDelete.id} 失敗`;
        console.error(`刪除客戶 API 錯誤 (ID: ${customerToDelete.id}):`, errorMessage);
        throw new Error(errorMessage);
      }

      // 刪除成功後重新獲取客戶資料
      fetchCustomers(filterStatus);

      // 使用 setNotification 顯示成功訊息
      setNotification({ message: `客戶 ${customerToDelete.name} (ID: ${customerToDelete.id}) 刪除成功！`, type: "success" });

      closeDeleteConfirmModal(); // 關閉確認框

    } catch (err) {
      console.error("刪除客戶錯誤:", err);
      // 使用 setNotification 顯示錯誤訊息
      setNotification({ message: "刪除客戶失敗：" + err.message, type: "error" });
      closeDeleteConfirmModal(); // 關閉確認框
    } finally {
      setIsDeleting(false); // 刪除結束，設置狀態為 false
    }
  };

  // 關閉刪除確認框並清除狀態
  const closeDeleteConfirmModal = () => {
    setShowDeleteConfirm(false);
    setCustomerToDelete(null);
    setDeleteConfirmationInput('');
  };


  // --- 拖曳開始處理 ---
  const onDragStart = (start) => {
    console.log("Drag started for:", start.draggableId);
  };

  // --- 拖曳結束處理 ---
  const onDragEnd = async (result) => {

    const { destination, draggableId } = result; // 移除 source

    // 如果沒有目的地，或者目的地不是 'open' 或 'closed' 區域，則返回
    const allowedDropZones = ['open', 'closed'];
    if (!destination || !allowedDropZones.includes(destination.droppableId)) {
      console.log("Drag cancelled: Invalid drop destination.");
      // 在此處可以選擇性地還原 UI 到拖曳前的狀態 (如果之前有樂觀更新)
      // fetchCustomers(filterStatus); // 重新抓取數據是一個簡單的還原方式
      return;
    }

    const customerId = parseInt(draggableId.split('-')[1]);
    const targetStatus = destination.droppableId; // 'open' 或 'closed'

    // 找到被拖曳的客戶
    const draggedCustomer = allCustomers.find(c => c.id === customerId);
    // 如果找不到客戶或狀態並未改變，則返回
    if (!draggedCustomer || draggedCustomer.status === targetStatus) {
      console.log("Drag cancelled: Customer not found or status unchanged.");
      return;
    }

    // 樂觀更新 UI - 僅在目標是有效拖曳區時進行樂觀更新
    const originalAllCustomers = [...allCustomers];
    // originalFilteredCustomers 在 API 失敗時用於還原 filteredCustomers，保留
    const originalFilteredCustomers = [...filteredCustomers];

    const updatedAllCustomersOptimistic = allCustomers.map(c =>
      c.id === customerId ? { ...c, status: targetStatus } : c
    );
    setAllCustomers(updatedAllCustomersOptimistic);

    // 根據篩選狀態更新 filteredCustomers
    if (filterStatus === 'all') {
      setFilteredCustomers(updatedAllCustomersOptimistic);
    } else {
      // 如果目標狀態與當前篩選狀態不同，則從列表中移除
      if (draggedCustomer.status === filterStatus && targetStatus !== filterStatus) {
        setFilteredCustomers(filteredCustomers.filter(c => c.id !== customerId));
      }
      else if (draggedCustomer.status !== filterStatus && targetStatus === filterStatus) {
        // 在這裡不直接添加，依賴 useEffect 根據 allCustomers 變化來過濾
        console.log(`Item ${customerId} dropped into matching filter status ${filterStatus}, but was not in filtered list. Will be added on next state update.`);
      } else {
        // 如果原本就在列表，且狀態改變後仍在列表 (例如 open -> open 篩選下)，更新狀態
        setFilteredCustomers(filteredCustomers.map(c =>
          c.id === customerId ? { ...c, status: targetStatus } : c
        ));
      }
    }

    try {
      // ** 修改 API 呼叫：將 PATCH 改為 PUT，並將端點改為 /customers/:id/status **
      const updateRes = await fetch(`http://localhost:5000/customers/${customerId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!updateRes.ok) {
        // 嘗試解析錯誤響應的 JSON，即使狀態碼不是 2xx
        const errorData = await updateRes.json().catch(() => ({ message: "未知錯誤" })); // 如果解析失敗，提供一個預設訊息

        throw new Error(errorData.message || `更新客戶 ${customerId} 狀態失敗`);
      }

      // 如果後端更新成功，重新獲取客戶資料以確保一致性
      fetchCustomers(filterStatus);
      console.log(`客戶 ${customerId} 狀態更新為 ${targetStatus} 成功`);
      // 使用 setNotification 顯示成功訊息
      setNotification({ message: `客戶 ${draggedCustomer.groom_name} 的狀態已更新為 ${targetStatus === 'open' ? '未結案' : '已結案'}`, type: "success" });


    } catch (err) {
      console.error("更新客戶狀態錯誤:", err);
      // 使用 setNotification 顯示錯誤訊息
      setNotification({ message: "更新客戶狀態失敗：" + err.message, type: "error" });

      // 如果 API 失敗，還原 UI 到拖曳前的狀態
      setAllCustomers(originalAllCustomers);
      setFilteredCustomers(originalFilteredCustomers); // 還原 filteredCustomers
    }
  };

  // 根據 status 取得對應的背景色 (用於 'all' 視圖)
  const getStatusColor = (status) => {
    if (filterStatus !== 'all') return '';
    switch (status) {
      case 'open': return 'bg-yellow-100 hover:bg-yellow-200'; // 未結案
      case 'closed': return 'bg-green-100 hover:bg-green-200'; // 已結案
      default: return 'hover:bg-slate-100';
    }
  };

  // 處理篩選變更
  const handleFilterChange = (newStatus) => {
    setFilterStatus(newStatus);
    setIsMenuOpen(false); // 選擇後關閉選單
  };

  // --- 自訂拖曳預覽函式 ---
  const renderCustomerDragClone = (provided, snapshot, draggable) => {
    // 取得被拖曳的客戶資料
    const customer = filteredCustomers.find(c => c.id === parseInt(draggable.draggableId.split('-')[1]));

    if (!customer) return null; // 如果找不到客戶資料，不渲染預覽

    // 合併庫提供的 style 和我們自訂的 style
    const combinedStyle = {
      ...provided.draggableProps.style, // 包含庫提供的定位和變換
      // 我們自訂的預覽元素樣式
      backgroundColor: snapshot.isDragging ? '#bae6fd' : 'white', // 淺藍色背景，拖曳時更明顯
      padding: '0.5rem 1rem', // 一些內距
      border: '1px solid #0284c7', // 邊框
      borderRadius: '0.375rem', // 圓角
      width: 'auto', // 寬度根據內容自動調整
      minWidth: 'auto', // 確保不繼承最小寬度
      maxWidth: '300px', // 可選：設置最大寬度，避免過長
      boxShadow: snapshot.isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none', // 陰影
      textAlign: 'center', // 文字居中
      // 確保拖曳時的位置和動畫由 dnd 庫控制
      position: provided.draggableProps.style.position, // 使用庫提供的定位類型
      top: provided.draggableProps.style.top,
      left: provided.draggableProps.style.left,
      transform: provided.draggableProps.style.transform, // 使用庫提供的 transform
      transition: 'none', // 禁用動畫，由庫處理
      zIndex: 5000, // 確保它浮動在其他元素之上
      // 尝试更直接地控制宽度
      boxSizing: 'content-box', // 尝试使用 content-box 模型
    };


    return (
      // 將 provided.draggableProps 和 ref 應用到最外層 div
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        {...provided.dragHandleProps} // 通常也會將 dragHandleProps 應用到這裡
        style={combinedStyle} // 應用合併後的樣式
        className="text-slate-700 text-sm md:text-base font-semibold" // 文字樣式
      >
        {customer.groom_name}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-200">
        <p className="text-gray-600 text-xl">載入中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-200">
        <p className="text-red-600 text-xl">{error}</p>
      </div>
    );
  }

  return (
    <DragDropContext
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      renderClone={renderCustomerDragClone}
    >
      <div className="min-h-screen bg-slate-100 py-8 px-4 flex justify-center">

        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-md text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            {notification.message}
          </div>
        )}

        {showDeleteConfirm && customerToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm transform transition-all duration-300 scale-100">
              <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200">
                <h2 className="text-xl font-bold text-slate-700">確認刪除</h2>
                <button onClick={closeDeleteConfirmModal} className="text-slate-500 hover:text-slate-700 text-2xl">&times;</button>
              </div>
              <p className="mb-4 text-slate-700">您確定要刪除客戶 <strong>{customerToDelete.name} (ID: {customerToDelete.id})</strong> 嗎？</p>
              <p className="mb-4 text-slate-700">請輸入 "<strong>{confirmationText}</strong>" 來確認。</p>
              <input
                type="text"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                placeholder={confirmationText}
                className="border border-slate-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="flex gap-4 mt-4 justify-end">
                <button
                  onClick={confirmDelete}
                  className="bg-red-600 text-white px-4 py-2 rounded-md shadow hover:bg-red-700 disabled:opacity-50"
                  disabled={isDeleting || deleteConfirmationInput !== confirmationText}
                >
                  {isDeleting ? '刪除中...' : '確認刪除'}
                </button>
                <button onClick={closeDeleteConfirmModal} className="bg-slate-500 text-white px-4 py-2 rounded-md shadow hover:bg-slate-600" disabled={isDeleting}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}


        <div className="w-full max-w-screen-xl flex flex-col md:flex-row overflow-x-hidden">
          <div className="flex-grow w-full md:w-auto bg-white shadow-lg rounded-lg p-6 md:p-8 md:mr-4 mb-4 md:mb-0">
            <div className="flex justify-between items-center mb-8">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-slate-700 text-2xl p-2">
                <FiMenu />
              </button>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-700 md:ml-0 mx-auto">
                客戶管理 ({filterStatus === 'all' ? '全部' : filterStatus === 'open' ? '未結案' : '已結案'})
              </h1>
              <button
                onClick={() => setShowForm(true)}
                className="bg-sky-700 text-white px-4 py-2 rounded-md shadow hover:bg-sky-800 transition-colors duration-200 text-sm md:text-base"
                disabled={isSubmitting || isDeleting}
              >
                新增客戶
              </button>
            </div>

            <div className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out`}>
              <div className="p-4">
                <button onClick={() => setIsMenuOpen(false)} className="absolute top-2 right-2 text-slate-500 text-2xl">&times;</button>
                <h2 className="text-xl font-semibold mb-4">篩選</h2>
                <button onClick={() => handleFilterChange('all')} className={`block w-full text-left p-2 rounded mb-2 ${filterStatus === 'all' ? 'bg-sky-100' : 'hover:bg-gray-100'}`}>全部</button>
                <button onClick={() => handleFilterChange('open')} className={`block w-full text-left p-2 rounded mb-2 ${filterStatus === 'open' ? 'bg-sky-100' : 'hover:bg-gray-100'}`}>未結案</button>
                <button onClick={() => handleFilterChange('closed')} className={`block w-full text-left p-2 rounded ${filterStatus === 'closed' ? 'bg-sky-100' : 'hover:bg-gray-100'}`}>已結案</button>
              </div>
            </div>
            {isMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsMenuOpen(false)}></div>}


            {showForm && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100">
                  <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200">
                    <h2 className="text-xl font-bold text-slate-700">新增客戶資訊</h2>
                    <button onClick={() => { setShowForm(false); setFormErrors({}); setFormData({ groom_name: "", bride_name: "", email: "", phone: "", wedding_date: "", wedding_location: "", form_link: "" }); }} className="text-slate-500 hover:text-slate-700 text-2xl">&times;</button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">新人姓名</label>
                      <input type="text" name="groom_name" value={formData.groom_name} onChange={handleChange} placeholder="新人姓名" className={`border ${formErrors.groom_name ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.groom_name && <p className="text-red-500 text-sm mt-1">{formErrors.groom_name}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1"></label>
                      <input type="text" name="bride_name" value={formData.bride_name} onChange={handleChange} placeholder="新人姓名" className={`border ${formErrors.bride_name ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.bride_name && <p className="text-red-500 text-sm mt-1">{formErrors.bride_name}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">聯絡信箱</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="聯絡信箱" className={`border ${formErrors.email ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="聯絡電話" className={`border ${formErrors.phone ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">婚禮日期時間</label>
                      <input type="datetime-local" name="wedding_date" value={formData.wedding_date} onChange={handleChange} className={`border ${formErrors.wedding_date ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.wedding_date && <p className="text-red-500 text-sm mt-1">{formErrors.wedding_date}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">婚禮地點</label>
                      <input type="text" name="wedding_location" value={formData.wedding_location} onChange={handleChange} placeholder="婚禮地點" className={`border ${formErrors.wedding_location ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.wedding_location && <p className="text-red-500 text-sm mt-1">{formErrors.wedding_location}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Google 試算表連結</label>
                      <input type="text" name="form_link" value={formData.form_link} onChange={handleChange} placeholder="google 試算表連結" className={`border ${formErrors.form_link ? 'border-red-500' : 'border-slate-300'} rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500`} />
                      {formErrors.form_link && <p className="text-red-500 text-sm mt-1">{formErrors.form_link}</p>}
                    </div>

                  </div>
                  {formErrors.submit && <p className="text-red-600 text-sm mt-2 text-center">{formErrors.submit}</p>}
                  <div className="flex gap-4 mt-4 justify-end">
                    <button onClick={handleSubmit} className="bg-sky-700 text-white px-4 py-2 rounded-md shadow hover:bg-sky-800 disabled:opacity-50" disabled={isSubmitting}>{isSubmitting ? '提交中...' : '確認新增'}</button>
                    <button onClick={() => { setShowForm(false); setFormErrors({}); setFormData({ groom_name: "", bride_name: "", email: "", phone: "", wedding_date: "", wedding_location: "", form_link: "" }); }} className="bg-slate-500 text-white px-4 py-2 rounded-md shadow hover:bg-slate-600 disabled:opacity-50" disabled={isSubmitting}>取消</button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto mt-6">
              <table className="w-full text-center border-collapse table-auto">
                <thead className="bg-slate-300 text-slate-700">
                  <tr>
                    <th className="py-3 px-4 border-b border-slate-400 text-sm md:text-lg font-semibold">新人</th>
                    <th className="py-3 px-4 border-b border-slate-400 text-sm md:text-lg font-semibold"></th>
                    <th className="py-3 px-4 border-b border-slate-400 text-sm md:text-lg font-semibold">電子郵件</th>
                    <th className="py-3 px-4 border-b border-slate-400 text-sm md:text-lg font-semibold">操作</th>
                  </tr>
                </thead>
                <Droppable droppableId="customer-list" type="CUSTOMER" isDropDisabled={true}>
                  {(provided) => (
                    <tbody {...provided.droppableProps} ref={provided.innerRef}>
                      {filteredCustomers.map((c, index) => (
                        <Draggable
                          key={c.id}
                          draggableId={`customer-${c.id}`}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            // 將 provided.draggableProps 和 ref 應用到 tr
                            <tr
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${getStatusColor(c.status)} ${snapshot.isDragging ? 'bg-sky-100 shadow-lg opacity-90' : ''}`}
                              style={provided.draggableProps.style}
                            >
                              <td className="py-3 px-4 border-b border-slate-200 text-sm md:text-lg">{c.groom_name}</td>
                              <td className="py-3 px-4 border-b border-slate-200 text-sm md:text-lg">{c.bride_name}</td>
                              <td className="py-3 px-4 border-b border-slate-200 text-sm md:text-lg break-all">{c.email}</td>
                              <td className="py-3 px-4 border-b border-slate-200 text-sm md:text-lg">
                                <div className="flex flex-col sm:flex-row justify-center items-center space-y-1 sm:space-y-0 sm:space-x-2">
                                  <Link to={`/customer/${c.id}`} className="inline-block w-full sm:w-auto text-center bg-sky-600 text-white px-3 py-1 rounded hover:bg-sky-700 transition text-xs sm:text-sm">查看</Link>
                                  <button onClick={() => handleDeleteCustomer(c.id, `${c.groom_name} & ${c.bride_name}`)} className="inline-block w-full sm:w-auto text-center bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition text-xs sm:text-sm" disabled={isDeleting}>刪除</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </tbody>
                  )}
                </Droppable>
              </table>
            </div>

            {filteredCustomers.length === 0 && !loading && (
              <p className="text-center text-slate-500 mt-8 text-lg">
                {filterStatus === 'all' ? '目前沒有客戶資料。' : filterStatus === 'open' ? '沒有未結案的客戶資料。' : '沒有已結案的客戶資料。'}
              </p>
            )}
          </div>

          <div className="w-full md:w-56 flex-shrink-0">
            <div className="flex flex-col space-y-4">
              <Droppable droppableId="open" type="CUSTOMER">
                {(provided, snapshot) => (
                  // 將 provided.droppableProps 和 ref 應用到 div
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    // 添加 flex 樣式來居中內容, 並添加 class 用於隱藏 placeholder
                    className={`flex-1 md:flex-none bg-white shadow-lg rounded-lg p-4 min-h-[150px] md:min-h-[200px] border-2 border-dashed transition-colors duration-200 flex flex-col justify-center items-center text-center non-table-droppable ${snapshot.isDraggingOver ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300'}`}
                  >
                    <h2 className="text-lg md:text-xl font-semibold text-slate-700 mb-2">未結案區</h2>
                    <p className="text-xs md:text-sm text-center text-gray-500">拖曳至此標記為未結案</p>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              <Droppable droppableId="closed" type="CUSTOMER">
                {(provided, snapshot) => (
                  // 將 provided.droppableProps 和 ref 應用到 div
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    // 添加 flex 樣式來居中內容, 並添加 class 用於隱藏 placeholder
                    className={`flex-1 md:flex-none bg-white shadow-lg rounded-lg p-4 min-h-[150px] md:min-h-[200px] border-2 border-dashed transition-colors duration-200 flex flex-col justify-center items-center text-center non-table-droppable ${snapshot.isDraggingOver ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                  >
                    <h2 className="text-lg md:text-xl font-semibold text-center text-slate-700 mb-2">已結案區</h2>
                    <p className="text-xs md:text-sm text-center text-gray-500">拖曳至此標記為已結案</p>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>

        </div>
      </div>
    </DragDropContext>
  );
}

export default App;