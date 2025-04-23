import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom"; // 引入 useNavigate
import moment from 'moment';
import validator from 'validator'; // 引入 validator 函式庫用於驗證

function CustomerDetails() {
    const { id } = useParams();
    const navigate = useNavigate(); // 獲取 navigate 函式

    const [customer, setCustomer] = useState(null);
    const [sheetData, setSheetData] = useState(null);
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line no-unused-vars
    const [error, setError] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // 新增狀態來控制客戶資訊區塊的收合，初始值改為 true (預設收合)
    const [isCustomerInfoCollapsed, setIsCustomerInfoCollapsed] = useState(true);

    // ==== 編輯客戶資訊相關的狀態 ====
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState({
        groom_name: "",
        bride_name: "",
        email: "",
        phone: "",
        wedding_date: "", // datetime-local 格式字串
        wedding_location: "",
        form_link: "",
    });
    const [editFormErrors, setEditFormErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false); // 追蹤是否正在儲存

    // *** 新增狀態來管理提示訊息 { message: '...', type: 'success' | 'error' | null } ***
    const [notification, setNotification] = useState(null);

    // *** 新增狀態來管理寄送請帖確認框 (移除輸入文字相關的狀態) ***
    const [showSendEmailConfirm, setShowSendEmailConfirm] = useState(false);
    // const [sendEmailConfirmationInput, setSendEmailConfirmationInput] = useState(''); // 移除此行
    // const sendEmailConfirmationText = "確認寄送"; // 移除此行


    // 獨立函式用於抓取賓客資料，使用 useCallback進行 memoize
    const fetchSheetData = useCallback(async () => {
        try {
            const sheetDataRes = await fetch(`http://localhost:5000/customers/${id}/sheet-data`);
            if (!sheetDataRes.ok) {
                setSheetData([]);
                console.warn("抓取賓客資料 API 返回非 OK 狀態:", sheetDataRes.status);
                return;
            }
            const sheetData = await sheetDataRes.json();
            if (sheetData && Array.isArray(sheetData)) {
                setSheetData(sheetData);
            } else {
                setSheetData([]);
                console.warn("抓取賓客資料 API 返回的格式非陣列:", sheetData);
            }

        } catch (err) {
            console.error("抓取賓客資料錯誤:", err);
            setSheetData([]);
        }
    }, [id]);


    useEffect(() => {
        const fetchCustomerData = async () => {
            setLoading(true);
            setError(null);
            try {
                const customerRes = await fetch(`http://localhost:5000/customers/${id}`);
                if (!customerRes.ok) {
                    if (customerRes.status === 404) {
                        throw new Error("找不到客戶資料");
                    }
                    throw new Error("抓取客戶資料 API 請求失敗：" + customerRes.statusText);
                }
                const customerData = await customerRes.json();
                setCustomer(customerData);

                // 在獲取到客戶資料後，初始化編輯表單的 state
                // 注意：需要將日期和時間合併為 datetime-local 格式
                const initialEditData = {
                    groom_name: customerData.groom_name || "",
                    bride_name: customerData.bride_name || "",
                    email: customerData.email || "",
                    phone: customerData.phone || "",
                    // 將日期和時間合併為YYYY-MM-DDTHH:mm 格式 (datetime-local 所需)
                    wedding_date: (customerData.wedding_date && customerData.wedding_time)
                        ? `${moment(customerData.wedding_date).format('YYYY-MM-DD')}T${customerData.wedding_time.substring(0, 5)}` // 取 HH:mm 部分
                        : customerData.wedding_date ? moment(customerData.wedding_date).format('YYYY-MM-DD') : '', // 如果只有日期
                    wedding_location: customerData.wedding_location || "",
                    form_link: customerData.google_sheet_link || "", // 注意欄位名稱對應
                };
                setEditFormData(initialEditData);


                await fetchSheetData();

            } catch (err) {
                console.error("載入資料錯誤:", err);
                setError(err.message || "載入資料失敗。");
                setCustomer(null);
                setSheetData([]);
                // *** 使用 setNotification 顯示錯誤訊息 ***
                setNotification({ message: err.message || "載入資料失敗。", type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchCustomerData();
    }, [id, fetchSheetData]);


    // *** 使用 useEffect 來自動隱藏提示訊息 ***
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => {
                setNotification(null);
            }, 5000); // 5 秒後隱藏提示訊息

            return () => clearTimeout(timer); // 在 notification 改變或元件卸載時清除 timer
        }
    }, [notification]);


    // 函式用於更新單個賓客的寄送狀態
    const updateGuestStatus = async (guestId, status) => {
        try {
            const res = await fetch("http://localhost:5000/update-status", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ guest_id: guestId, status: status }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`更新賓客 ${guestId} 狀態失敗: ${res.status} ${res.statusText} - ${errorText}`);
                return false;
            } else {
                console.log(`賓客 ${guestId} 狀態更新成功`);
                return true;
            }
        } catch (err) {
            console.error(`呼叫更新狀態 API 錯誤 (賓客 ${guestId}):`, err);
            return false;
        }
    };


    // ==== 處理點擊寄送請帖按鈕 (開啟確認框) ====
    const handleSendEmailButtonClick = () => {
        if (!sheetData || sheetData.length === 0) {
            setNotification({ message: "沒有賓客資料，無法寄送邀請函。", type: "error" });
            return;
        }

        if (!customer) {
            setNotification({ message: "客戶資料尚未載入，無法寄送。", type: "error" });
            return;
        }

        const guestsToSend = sheetData.filter(guest => !guest.is_sent && guest.email); // 只寄送未寄送且有 Email 的賓客

        if (guestsToSend.length === 0) {
            setNotification({ message: "所有賓客都已寄送過請帖，或沒有有效的電子郵件地址。", type: "info" });
            return;
        }


        setShowSendEmailConfirm(true); // 顯示寄送確認 Modal
    };

    // ==== 處理寄送確認並執行寄信 API (移除輸入文字檢查) ====
    const confirmSendEmail = async () => {
        // 移除檢查使用者輸入文字的邏輯

        setIsSendingEmail(true); // 開始寄送，設置狀態為 true
        closeSendEmailConfirmModal(); // 關閉確認框

        const guestsToSend = sheetData.filter(guest => !guest.is_sent && guest.email); // 再次過濾確保發送正確的賓客

        const payload = {
            customerId: id,
            customer: customer,
            sheetData: guestsToSend.map(guest => ({
                id: guest.id,
                googleSheetGuestId: guest.google_sheet_guest_id,
                guestName: guest.guest_name,
                email: guest.email,
                isSent: guest.is_sent,
                relationshipWithGroom: guest.relationshipWithGroom,
                relationshipWithBride: guest.relationshipWithBride,
                relationshipWithCouple: guest.relationshipWithCouple,
                guestDescription: guest.guestDescription,
                sharedMemories: guest.sharedMemories,
                message: guest.message
            }))
        };

        console.log("發送到 n8n 的 payload:", payload);

        try {
            const res = await fetch("https://anitakao.app.n8n.cloud/webhook-test/f629e12f-7ac6-4d3e-934f-d984449e8d50", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`寄信 API 請求失敗：${res.status} ${res.statusText} - ${errorText}`);
            }

            setNotification({ message: "請帖寄送請求已發送！正在嘗試更新賓客狀態。", type: "success" });

            const updatePromises = guestsToSend.map(guest => updateGuestStatus(guest.id, 1));
            const updateResults = await Promise.all(updatePromises);

            const failedUpdates = guestsToSend.filter((_, index) => !updateResults[index]);
            if (failedUpdates.length > 0) {
                console.error("以下賓客狀態更新失敗:", failedUpdates);
                setNotification({ message: `請帖寄送請求已發送，但有 ${failedUpdates.length} 位賓客狀態更新失敗。`, type: "warning" });
            } else {
                setNotification({ message: "請帖寄送成功且賓客狀態已更新！", type: "success" });
            }

            await fetchSheetData(); // 重新抓取資料以更新 UI 上的寄送狀態


        } catch (err) {
            console.error("寄信錯誤:", err);
            setNotification({ message: "寄信失敗：" + err.message, type: "error" });
        } finally {
            setIsSendingEmail(false); // 寄送結束，設置狀態為 false
        }
    };

    // 關閉寄送確認框並清除狀態 (移除清除輸入框狀態)
    const closeSendEmailConfirmModal = () => {
        setShowSendEmailConfirm(false);
        // setSendEmailConfirmationInput(''); // 移除此行
    };


    const handleSyncData = async () => {
        if (!customer) {
            setNotification({ message: "客戶資料尚未載入，無法同步。", type: "error" });
            return;
        }

        setIsSyncing(true);

        try {
            const res = await fetch(`http://localhost:5000/sync-sheet-data/${id}`, {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMessage = data.message || "同步 API 請求失敗";
                throw new Error(errorMessage);
            }

            setNotification({ message: data.message, type: "success" });


            await fetchSheetData();

        } catch (err) {
            console.error("同步資料錯誤:", err);
            setNotification({ message: "同步資料失敗：" + err.message, type: "error" });
        } finally {
            setIsSyncing(false);
        }
    };

    // Helper function to format date and time
    const formatWeddingDateTime = (date, time) => {
        let dateTimeString = '';
        // 檢查 date 是否為有效日期物件或字串
        const validDate = moment(date);
        if (date && validDate.isValid()) {
            dateTimeString += validDate.format('YYYY-MM-DD');
        } else if (date) {
            // 如果 date 存在但無效，可能是其他格式的字串，嘗試直接顯示
            dateTimeString += String(date);
        }


        if (time) {
            if (dateTimeString) { // 如果日期部分已經有內容
                dateTimeString += ' '; // 加一個空格分隔
            }
            // 確保 time 是字串，並只取 HH:MM 部分 (如果需要)
            const timeString = String(time);
            // 簡單判斷是否包含秒，如果包含則只取 HH:MM
            if (timeString.split(':').length > 2) {
                dateTimeString += timeString.substring(0, 5);
            } else {
                dateTimeString += timeString; // 否則直接顯示 HH:MM 或其他格式
            }
        }

        if (!dateTimeString) {
            return '未設定';
        }
        return dateTimeString;
    };


    // ==== 編輯表單相關函式 ====
    // *** 此函式用於處理編輯表單的輸入變化 ***
    const handleEditFormChange = (e) => {
        setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
        // 當使用者修改欄位時，清除該欄位的錯誤訊息
        if (editFormErrors[e.target.name]) {
            setEditFormErrors({ ...editFormErrors, [e.target.name]: "" });
        }
        // 清除提交錯誤訊息
        if (editFormErrors.submit) {
            setEditFormErrors({ ...editFormErrors, submit: "" });
        }
    };

    // 編輯表單驗證函式
    const validateEditForm = () => {
        const errors = {};
        if (!editFormData.groom_name.trim()) errors.groom_name = "請填寫新郎姓名";
        if (!editFormData.bride_name.trim()) errors.bride_name = "請填寫新娘姓名";
        if (!editFormData.email.trim()) {
            errors.email = "請填寫電子郵件地址";
        } else if (!validator.isEmail(editFormData.email)) {
            errors.email = "請輸入有效的電子郵件地址";
        }
        if (!editFormData.phone.trim()) errors.phone = "請填寫聯絡電話";
        // 婚禮日期非必填，但如果填了，格式要正確
        if (editFormData.wedding_date && !moment(editFormData.wedding_date).isValid()) {
            errors.wedding_date = "請選擇有效的婚禮日期和時間";
        }
        if (!editFormData.form_link.trim()) {
            errors.form_link = "請填寫 Google 試算表連結";
        } else if (!validator.isURL(editFormData.form_link, { require_protocol: true })) {
            errors.form_link = "請輸入有效的連結 (包含 http:// 或 https://)";
        }
        // wedding_location 目前不設定為必填，如果需要請取消註解下面這行
        // if (!editFormData.wedding_location.trim()) errors.wedding_location = "請填寫婚禮地點";


        setEditFormErrors(errors);
        return Object.keys(errors).length === 0;
    };


    // *** 此函式用於儲存編輯後的客戶資訊 ***
    const handleSaveEdit = async () => {
        if (!validateEditForm()) {
            return; // 驗證失敗，停止儲存
        }

        setIsSaving(true); // 開始儲存，設置狀態為 true

        // ==== 呼叫後端 PUT API 更新客戶資料 ====
        try {
            const res = await fetch(`http://localhost:5000/customers/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editFormData), // 發送編輯表單的資料
            });

            const data = await res.json(); // 嘗試解析 JSON

            if (!res.ok) {
                // 根據後端返回的錯誤訊息來顯示
                const errorMessage = data.message || "更新失敗，請稍後再試";
                throw new Error(errorMessage);
            }

            setNotification({ message: "客戶資料更新成功！", type: "success" });

            setShowEditForm(false); // 關閉 Modal
            setEditFormErrors({}); // 清空錯誤訊息


            // 重新抓取客戶資料以更新畫面上顯示的資訊
            // 可以考慮只更新 customer state 而非重新 fetch，以提高效能
            // 例如：setCustomer({ ...customer, ...editFormData });
            // 但重新 fetch 可以確保資料與後端完全同步
            const customerRes = await fetch(`http://localhost:5000/customers/${id}`);
            if (customerRes.ok) {
                const updatedCustomerData = await customerRes.json();
                setCustomer(updatedCustomerData);

                // 更新編輯表單的 state 以保持一致
                const initialEditData = {
                    groom_name: updatedCustomerData.groom_name || "",
                    bride_name: updatedCustomerData.bride_name || "",
                    email: updatedCustomerData.email || "",
                    phone: updatedCustomerData.phone || "",
                    wedding_date: (updatedCustomerData.wedding_date && updatedCustomerData.wedding_time)
                        ? `${moment(updatedCustomerData.wedding_date).format('YYYY-MM-DD')}T${updatedCustomerData.wedding_time.substring(0, 5)}`
                        : updatedCustomerData.wedding_date ? moment(updatedCustomerData.wedding_date).format('YYYY-MM-DD') : '',
                    wedding_location: updatedCustomerData.wedding_location || "",
                    form_link: updatedCustomerData.google_sheet_link || "",
                };
                setEditFormData(initialEditData);

            } else {
                console.error("重新抓取更新後的客戶資料失敗:", customerRes.statusText);
                // 即使重新抓取失敗，也清空錯誤訊息，使用者至少知道更新成功
                setEditFormErrors({});
            }


        } catch (err) {
            console.error("更新客戶資料錯誤：", err);
            setEditFormErrors({ ...editFormErrors, submit: err.message || "更新失敗，請稍後再試" });
            setNotification({ message: "更新客戶資料失敗：" + err.message, type: "error" });
        } finally {
            setIsSaving(false); // 儲存結束，設置狀態為 false
        }


    };


    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-md text-white ${notification.type === 'success' ? 'bg-green-500' : notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {notification.message}
                </div>
            )}

            {showSendEmailConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm transform transition-all duration-300 scale-100">
                        <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-200">
                            <h2 className="text-xl font-bold text-gray-700">確認寄送請帖</h2>
                            <button onClick={closeSendEmailConfirmModal} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                        </div>
                        <p className="mb-4 text-gray-700">您確定要向所有未寄送且有有效電子郵件地址的賓客寄送請帖嗎？</p>

                        <div className="flex gap-4 mt-4 justify-end">
                            <button
                                onClick={confirmSendEmail} // 點擊確認時呼叫 confirmSendEmail
                                className="bg-green-600 text-white px-4 py-2 rounded-md shadow hover:bg-green-700 disabled:opacity-50"
                                disabled={isSendingEmail} // 只根據是否正在寄送來禁用按鈕
                            >
                                {isSendingEmail ? '寄送中...' : '確認寄送'}
                            </button>
                            <button onClick={closeSendEmailConfirmModal} className="bg-gray-500 text-white px-4 py-2 rounded-md shadow hover:bg-gray-600" disabled={isSendingEmail}>
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8 relative">

                <button
                    onClick={() => navigate(-1)} // 使用 navigate(-1) 返回上一頁
                    className="absolute top-4 left-4 bg-gray-300 text-gray-700 px-4 py-2 rounded-md shadow hover:bg-gray-400 transition-colors duration-200 text-lg" // 增加 px, py 和 text-lg
                >
                    返回
                </button>

                <h1 className="text-4xl font-semibold mb-8 text-center text-gray-800">客戶詳情</h1>
                <div className="border border-gray-300 rounded-lg mb-6">
                    <button
                        className="w-full text-left px-6 py-4 bg-gray-200 hover:bg-gray-300 font-semibold text-gray-700 flex justify-between items-center"
                        onClick={() => setIsCustomerInfoCollapsed(!isCustomerInfoCollapsed)}
                    >
                        客戶資訊
                        <span>{isCustomerInfoCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!isCustomerInfoCollapsed && customer && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-lg text-gray-700">
                            <div className="md:col-span-2 flex flex-wrap gap-x-8">
                                <p>
                                    <span className="font-semibold">新郎:</span> {customer.groom_name}
                                </p>
                                <p>
                                    <span className="font-semibold">新娘:</span> {customer.bride_name}
                                </p>
                            </div>

                            <p>
                                <span className="font-semibold">聯絡信箱:</span> {customer.email}
                            </p>
                            <p>
                                <span className="font-semibold">聯絡電話:</span> {customer.phone}
                            </p>
                            <div className="md:col-span-2">
                                <p>
                                    <span className="font-semibold">婚禮日期時間:</span>{' '}
                                    {formatWeddingDateTime(customer.wedding_date, customer.wedding_time)}
                                </p>
                                <p className="mt-1">
                                    <span className="font-semibold">婚禮地點:</span> {customer.wedding_location || '未設定'}
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <p>
                                    <span className="font-semibold">賓客連結:</span>{' '}
                                    {customer.google_sheet_link ? (
                                        <a
                                            href={customer.google_sheet_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline break-all"
                                        >
                                            點此開啟
                                        </a>
                                    ) : (
                                        '未設定'
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {customer && (
                    <div className="flex justify-center gap-4 mb-6 flex-wrap">
                        <button
                            onClick={handleSyncData}
                            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition duration-300 ease-in-out disabled:opacity-50"
                            disabled={loading || isSendingEmail || isSyncing || showEditForm || isSaving || showSendEmailConfirm} // 在確認寄送 Modal 打開時也禁用其他按鈕
                        >
                            {isSyncing ? '同步中...' : '同步資料庫'}
                        </button>

                        <button
                            onClick={() => {
                                // 打開編輯 Modal，並使用當前客戶資料初始化表單
                                if (customer) {
                                    const initialEditData = {
                                        groom_name: customer.groom_name || "",
                                        bride_name: customer.bride_name || "",
                                        email: customer.email || "",
                                        phone: customer.phone || "",
                                        // 將日期和時間合併為YYYY-MM-DDTHH:mm 格式 (datetime-local 所需)
                                        // 處理日期和時間可能為 null 的情況
                                        wedding_date: (customer.wedding_date && customer.wedding_time)
                                            ? `${moment(customer.wedding_date).format('YYYY-MM-DD')}T${customer.wedding_time.substring(0, 5)}` // 取 HH:mm 部分
                                            : customer.wedding_date ? moment(customer.wedding_date).format('YYYY-MM-DD') : '', // 如果只有日期
                                        wedding_location: customer.wedding_location || "",
                                        form_link: customer.google_sheet_link || "", // 注意欄位名稱對應
                                    };
                                    setEditFormData(initialEditData);
                                    setEditFormErrors({}); // 打開表單時清除錯誤
                                    setShowEditForm(true);
                                }
                            }}
                            className="bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700 transition duration-300 ease-in-out disabled:opacity-50"
                            disabled={loading || isSendingEmail || isSyncing || showEditForm || isSaving || showSendEmailConfirm} // 在確認寄送 Modal 打開時也禁用
                        >
                            編輯客戶資訊
                        </button>

                        <button
                            onClick={handleSendEmailButtonClick} // 呼叫開啟 Modal 的函式
                            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition duration-300 ease-in-out disabled:opacity-50"
                            disabled={loading || isSendingEmail || isSyncing || showEditForm || isSaving || showSendEmailConfirm} // 在確認寄送 Modal 打開時也禁用
                        >
                            {isSendingEmail ? '寄送中...' : '寄送請帖'}
                        </button>
                    </div>
                )}


                {showEditForm && (
                    <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100">
                            <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-200">
                                <h2 className="text-xl font-bold text-gray-700">編輯客戶資訊</h2>
                                <button onClick={() => {
                                    setShowEditForm(false);
                                    setEditFormErrors({}); // 關閉表單時清除錯誤訊息
                                    // 可以選擇重置 editFormData 或保持原狀
                                }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">新郎姓名</label>
                                    <input
                                        type="text"
                                        name="groom_name"
                                        value={editFormData.groom_name}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="新郎姓名"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.groom_name ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.groom_name && <p className="text-red-500 text-sm mt-1">{editFormErrors.groom_name}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">新娘姓名</label>
                                    <input
                                        type="text"
                                        name="bride_name"
                                        value={editFormData.bride_name}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="新娘姓名"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.bride_name ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.bride_name && <p className="text-red-500 text-sm mt-1">{editFormErrors.bride_name}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡信箱</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={editFormData.email}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="聯絡信箱"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.email ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.email && <p className="text-red-500 text-sm mt-1">{editFormErrors.email}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={editFormData.phone}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="聯絡電話"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.phone ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.phone && <p className="text-red-500 text-sm mt-1">{editFormErrors.phone}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">婚禮日期時間</label>
                                    <input
                                        type="datetime-local"
                                        name="wedding_date" // 注意：這裡的 name 依然用 wedding_date，但在 state 中會是 datetime-local 字串
                                        value={editFormData.wedding_date}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.wedding_date ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.wedding_date && <p className="text-red-500 text-sm mt-1">{editFormErrors.wedding_date}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">婚禮地點</label>
                                    <input
                                        type="text"
                                        name="wedding_location"
                                        value={editFormData.wedding_location}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="婚禮地點"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.wedding_location ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.wedding_location && <p className="text-red-500 text-sm mt-1">{editFormErrors.wedding_location}</p>}
                                </div>


                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Google 試算表連結</label>
                                    <input
                                        type="text"
                                        name="form_link" // 注意：這裡的 name 依然用 form_link，但在 state 中會是 Google Sheet 連結
                                        value={editFormData.form_link}
                                        onChange={handleEditFormChange} // *** 這裡使用 handleEditFormChange ***
                                        placeholder="google 試算表連結"
                                        className={`border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.form_link ? 'border-red-500' : ''}`}
                                    />
                                    {editFormErrors.form_link && <p className="text-red-500 text-sm mt-1">{editFormErrors.form_link}</p>}
                                </div>


                                {editFormErrors.submit && <p className="text-red-600 text-sm mt-2 text-center">{editFormErrors.submit}</p>}
                                <div className="flex gap-4 mt-2 justify-end">
                                    <button
                                        onClick={handleSaveEdit} // *** 這裡使用 handleSaveEdit ***
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={isSaving} // 儲存中時禁用按鈕
                                    >
                                        {isSaving ? '儲存中...' : '儲存變更'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowEditForm(false);
                                            setEditFormErrors({}); // 關閉表單時清除錯誤訊息
                                            // 不重置 editFormData，以便下次打開時保留上次打開時的資料
                                        }}
                                        className="bg-gray-500 text-white px-4 py-2 rounded-md shadow hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={isSaving} // 儲存中時禁用按鈕
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {sheetData && sheetData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse table-auto">
                            <thead className="bg-gray-200 text-gray-700">
                                <tr>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">賓客 ID</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">賓客姓名</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg">電子郵件地址</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">是否寄送</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheetData.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-100">
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.google_sheet_guest_id || '未同步'}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.guest_name}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-lg break-all">{row.email}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-lg text-center">
                                            {row.is_sent ? "已寄送" : "未寄送"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-gray-500 mt-4">目前沒有賓客資料。</p>
                )}
            </div>
        </div>
    );
}

export default CustomerDetails;