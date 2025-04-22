import React, { useEffect, useState, useCallback } from "react"; // 引入 useCallback
import { useParams } from "react-router-dom";
import moment from 'moment'; // 引入 moment.js 處理日期格式

function CustomerDetails() {
    const { id } = useParams();
    const [customer, setCustomer] = useState(null);
    const [sheetData, setSheetData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false); // 新增狀態追蹤是否正在寄信
    const [isSyncing, setIsSyncing] = useState(false); // 新增狀態追蹤是否正在同步資料


    // 獨立函式用於抓取賓客資料，使用 useCallback進行 memoize
    const fetchSheetData = useCallback(async () => {
        try {
            // 注意這裡查詢了 google_sheet_guest_id 欄位
            const sheetDataRes = await fetch(`http://localhost:5000/customers/${id}/sheet-data`);
            if (!sheetDataRes.ok) {
                // 即使 API 返回非 OK 狀態，也設置為空陣列並記錄警告
                setSheetData([]);
                console.warn("抓取賓客資料 API 返回非 OK 狀態:", sheetDataRes.status);
                return; // 停止執行後續代碼
            }
            const sheetData = await sheetDataRes.json();
            if (sheetData && Array.isArray(sheetData)) { // 確保返回的是陣列
                setSheetData(sheetData);
            } else {
                setSheetData([]); // 如果不是陣列，設置為空陣列
                console.warn("抓取賓客資料 API 返回的格式非陣列:", sheetData);
            }

        } catch (err) {
            console.error("抓取賓客資料錯誤:", err);
            setSheetData([]); // 發生錯誤時設置為空陣列
            // 您也可以在這裡設置一個特定的錯誤訊息給使用者
        }
    }, [id]); // fetchSheetData 依賴於 id


    useEffect(() => {
        const fetchCustomerData = async () => {
            setLoading(true);
            setError(null);
            try {
                // 抓取客戶詳細資料 (包含婚禮時間和地點)
                const customerRes = await fetch(`http://localhost:5000/customers/${id}`);
                if (!customerRes.ok) {
                    if (customerRes.status === 404) {
                        throw new Error("找不到客戶資料");
                    }
                    throw new Error("抓取客戶資料 API 請求失敗：" + customerRes.statusText);
                }
                const customerData = await customerRes.json();
                // 如果客戶資料獲取成功，再嘗試抓取賓客資料
                setCustomer(customerData);
                await fetchSheetData();


            } catch (err) {
                console.error("載入資料錯誤:", err);
                setError(err.message || "載入資料失敗。");
                setCustomer(null); // 載入客戶資料失敗時設置為 null
                setSheetData([]); // 載入客戶資料失敗時清空賓客資料
            } finally {
                setLoading(false);
            }
        };

        fetchCustomerData();
    }, [id, fetchSheetData]); // 將 fetchSheetData 加入依賴項陣列

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
                return false; // 返回 false 表示更新失敗
            } else {
                // const data = await res.json(); // 如果後端有返回 JSON
                console.log(`賓客 ${guestId} 狀態更新成功`);
                return true; // 返回 true 表示更新成功
            }
        } catch (err) {
            console.error(`呼叫更新狀態 API 錯誤 (賓客 ${guestId}):`, err);
            return false; // 返回 false 表示更新失敗
        }
    };


    const handleSendEmail = async () => { // 將函式改為 async
        if (!sheetData || sheetData.length === 0) {
            alert("沒有賓客資料，無法寄送邀請函。");
            return;
        }

        if (!customer) {
            alert("客戶資料尚未載入，無法寄送。");
            return;
        }

        const guestsToSend = sheetData.filter(guest => !guest.is_sent && guest.email); // 只寄送未寄送且有 Email 的賓客

        if (guestsToSend.length === 0) {
            alert("所有賓客都已寄送過請帖，或沒有有效的電子郵件地址。");
            return;
        }

        setIsSendingEmail(true); // 開始寄信，設置狀態為 true

        const payload = {
            customerId: id,
            customer: customer,
            sheetData: guestsToSend.map(guest => ({ // 只發送未寄送且有 Email 的賓客資料
                id: guest.id, // 資料庫中的賓客 ID
                googleSheetGuestId: guest.google_sheet_guest_id, // Google Sheet 中的賓客 ID
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
                const errorText = await res.text(); // 嘗試讀取錯誤響應的文本
                throw new Error(`寄信 API 請求失敗：${res.status} ${res.statusText} - ${errorText}`);
            }

            // const data = await res.json(); // 如果 n8n webhook 有返回 JSON，可以在這裡處理

            alert("請帖寄送請求已發送！正在嘗試更新賓客狀態。"); // 假設請求發送成功

            // **呼叫 updateGuestStatus 更新賓客狀態**
            const updatePromises = guestsToSend.map(guest => updateGuestStatus(guest.id, 1)); // 為每個已發送賓客創建更新狀態的 Promise
            const updateResults = await Promise.all(updatePromises); // 等待所有更新完成

            const failedUpdates = guestsToSend.filter((_, index) => !updateResults[index]);
            if (failedUpdates.length > 0) {
                console.error("以下賓客狀態更新失敗:", failedUpdates);
                alert(`請帖寄送請求已發送，但有 ${failedUpdates.length} 位賓客狀態更新失敗。`);
            } else {
                alert("請帖寄送成功且賓客狀態已更新！");
            }


            await fetchSheetData(); // 重新抓取賓客資料以更新畫面狀態


        } catch (err) {
            console.error("寄信錯誤:", err);
            alert("寄信失敗：" + err.message);
        } finally {
            setIsSendingEmail(false); // 寄信結束，設置狀態為 false
        }
    };


    const handleSyncData = async () => { // 將函式改為 async
        if (!customer) {
            alert("客戶資料尚未載入，無法同步。");
            return;
        }

        setIsSyncing(true); // 開始同步，設置狀態為 true

        try {
            const res = await fetch(`http://localhost:5000/sync-sheet-data/${id}`, {
                method: "POST",
            });

            const data = await res.json(); // 嘗試解析 JSON

            if (!res.ok) {
                // 如果狀態碼非 2xx，拋出錯誤
                const errorMessage = data.message || "同步 API 請求失敗";
                throw new Error(errorMessage);
            }

            alert(data.message); // 顯示同步結果訊息

            await fetchSheetData(); // 重新抓取賓客資料以更新畫面

        } catch (err) {
            console.error("同步資料錯誤:", err);
            alert("同步資料失敗：" + err.message);
        } finally {
            setIsSyncing(false); // 同步結束，設置狀態為 false
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-100">
                <p className="text-gray-700 text-2xl">載入中...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-100">
                <p className="text-red-600 text-2xl">{error}</p>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-100">
                <p className="text-red-600 text-2xl">無法找到客戶資料。</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
                <h1 className="text-4xl font-semibold mb-8 text-center text-gray-800">客戶詳情</h1>

                <div className="mb-6 pb-6 border-b border-gray-300">
                    <div className="flex justify-center mb-4 text-center flex-wrap">
                        <h2 className="text-2xl font-semibold text-gray-800 mr-4">新郎: {customer.groom_name}</h2>
                        <h2 className="text-2xl font-semibold text-gray-800 mr-4">新娘: {customer.bride_name}</h2>
                        <p className="text-xl mr-4">Email: {customer.email}</p>
                        <p className="text-xl">電話: {customer.phone}</p>
                    </div>

                    <div className="text-lg text-gray-700 mt-4 text-center">
                        <p>婚禮日期: {customer.wedding_date ? moment(customer.wedding_date).format('YYYY-MM-DD') : '未設定'}</p>
                        <p>婚禮時間: {customer.wedding_time || '未設定'}</p>
                        <p>婚禮地點: {customer.wedding_location || '未設定'}</p>
                        <p>Google Sheet 連結: <a href={customer.google_sheet_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{customer.google_sheet_link || '未設定'}</a></p>
                    </div>

                </div>

                <div className="flex justify-between mb-6">
                    <button
                        onClick={handleSyncData}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition duration-300 ease-in-out disabled:opacity-50" // 禁用狀態下的樣式
                        disabled={loading || isSendingEmail || isSyncing} // 在載入、寄信或同步時禁用按鈕
                    >
                        {isSyncing ? '同步中...' : '同步資料庫'}
                    </button>
                    <button
                        onClick={handleSendEmail}
                        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition duration-300 ease-in-out disabled:opacity-50" // 禁用狀態下的樣式
                        disabled={loading || isSendingEmail || isSyncing} // 在載入、寄信或同步時禁用按鈕
                    >
                        {isSendingEmail ? '寄送中...' : '寄送請帖'}
                    </button>
                </div>

                {sheetData && sheetData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse table-auto">
                            <thead className="bg-gray-200 text-gray-700">
                                <tr>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">賓客 ID</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">賓客姓名</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">電子郵件地址</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center font-semibold">是否寄送</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheetData.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-100">
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.google_sheet_guest_id || '未同步'}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.guest_name}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.email}</td>
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