import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

function CustomerDetails() {
    const { id } = useParams();
    const [customer, setCustomer] = useState(null);
    const [sheetData, setSheetData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

                const sheetDataRes = await fetch(`http://localhost:5000/customers/${id}/sheet-data`);
                if (sheetDataRes.ok) {
                    const sheetData = await sheetDataRes.json();
                    if (sheetData && sheetData.length > 0) {
                        setSheetData(sheetData);
                    } else {
                        setSheetData([]);
                    }
                } else {
                    setSheetData([]);
                    console.warn("該客戶尚無賓客資料 (可能為 404 或其他錯誤)");
                }
            } catch (err) {
                console.error("載入資料錯誤:", err);
                setError(err.message || "載入資料失敗。");
            } finally {
                setLoading(false);
            }
        };

        fetchCustomerData();
    }, [id]);

    const handleSendEmail = () => {
        if (!sheetData || sheetData.length === 0) {
            alert("沒有賓客資料，無法寄送邀請函。");
            return;
        }

        if (!customer) {
            alert("客戶資料尚未載入，無法寄送。");
            return;
        }

        const payload = {
            customerId: id,
            customer: customer,
            sheetData: sheetData.map(guest => ({
                id: guest.id,
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

        fetch("https://anitakao.app.n8n.cloud/webhook-test/f629e12f-7ac6-4d3e-934f-d984449e8d50", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error("寄信 API 請求失敗：" + res.statusText);
                }
                return res.json();
            })
            .then((data) => {
                alert(data.message || "請帖寄送成功！");
            })
            .catch((err) => {
                console.error("寄信錯誤:", err);
                alert("寄信失敗：" + err.message);
            });
    };

    const handleSyncData = () => {
        if (!customer) {
            alert("客戶資料尚未載入，無法同步。");
            return;
        }

        fetch(`http://localhost:5000/sync-sheet-data/${id}`, {
            method: "POST",
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error("同步 API 請求失敗：" + res.statusText);
                }
                return res.json();
            })
            .then((data) => {
                alert(data.message);
                fetch(`http://localhost:5000/customers/${id}/sheet-data`)
                    .then((res) => res.json())
                    .then((data) => {
                        if (data && data.length > 0) {
                            setSheetData(data);
                        } else {
                            setSheetData([]);
                        }
                    })
                    .catch((err) => console.error("重新抓取賓客資料錯誤:", err));
            })
            .catch((err) => {
                console.error("同步資料庫錯誤:", err);
                alert("同步資料庫失敗：" + err.message);
            });
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
                    <div className="flex justify-center mb-4 text-center">
                        <h2 className="text-2xl font-semibold text-gray-800">新郎: {customer.groom_name}</h2>
                        <h2 className="text-2xl font-semibold text-gray-800 ml-4">新娘: {customer.bride_name}</h2>
                        <p className="text-xl ml-4">Email: {customer.email}</p>
                        <p className="text-xl ml-4">phone: {customer.phone}</p>
                    </div>

                    <div className="text-lg text-gray-700 mt-4">
                        <p>婚禮日期: {new Date(customer.wedding_date).toISOString().split('T')[0]}</p>
                        <p>婚禮時間: {customer.wedding_time}</p>
                        <p>婚禮地點: {customer.wedding_location}</p>
                    </div>

                </div>

                <div className="flex justify-between mb-6">
                    <button
                        onClick={handleSyncData}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition duration-300 ease-in-out"
                    >
                        同步資料庫
                    </button>
                    <button
                        onClick={handleSendEmail}
                        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition duration-300 ease-in-out"
                    >
                        寄送請帖
                    </button>
                </div>

                {sheetData && sheetData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-200 text-gray-700">
                                <tr>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center">賓客姓名</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center">電子郵件地址</th>
                                    <th className="py-4 px-6 border-b border-gray-300 text-lg text-center">是否寄送</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheetData.map((row, index) => (
                                    <tr key={index} className="hover:bg-gray-100">
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.guest_name}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">{row.email}</td>
                                        <td className="py-3 px-6 border-b border-gray-300 text-center">
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
