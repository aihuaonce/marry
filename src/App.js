import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import validator from 'validator'; // 引入 validator 函式庫

function App() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    groom_name: "",
    bride_name: "",
    email: "",
    phone: "",
    wedding_date: "",
    form_link: "",
  });

  const [formErrors, setFormErrors] = useState({}); // 使用物件來存儲多個欄位的錯誤
  const [isSubmitting, setIsSubmitting] = useState(false); // 新增狀態追蹤是否正在提交表單


  useEffect(() => {
    fetch("http://localhost:5000/customers")
      .then((res) => {
        if (!res.ok) throw new Error("API request failed: " + res.statusText);
        return res.json();
      })
      .then((data) => {
        setCustomers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
        setError("無法載入客戶資料，請稍後再試。");
        setLoading(false);
      });
  }, []);

  // 表單驗證函式
  const validateForm = () => {
    const errors = {};
    if (!formData.groom_name.trim()) errors.groom_name = "請填寫新郎姓名";
    if (!formData.bride_name.trim()) errors.bride_name = "請填寫新娘姓名";
    if (!formData.email.trim()) {
      errors.email = "請填寫電子郵件地址";
    } else if (!validator.isEmail(formData.email)) {
      errors.email = "請輸入有效的電子郵件地址";
    }
    if (!formData.phone.trim()) errors.phone = "請填寫聯絡電話";
    if (!formData.wedding_date) errors.wedding_date = "請選擇婚禮日期";
    if (!formData.form_link.trim()) {
      errors.form_link = "請填寫 Google 試算表連結";
    } else if (!validator.isURL(formData.form_link, { require_protocol: true })) { // 簡單的 URL 格式驗證，要求包含協定
      errors.form_link = "請輸入有效的連結 (包含 http:// 或 https://)";
    }


    setFormErrors(errors);
    return Object.keys(errors).length === 0; // 如果 errors 物件為空，表示驗證通過
  };


  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // 當使用者修改欄位時，清除該欄位的錯誤訊息
    if (formErrors[e.target.name]) {
      setFormErrors({ ...formErrors, [e.target.name]: "" });
    }
    // 清除提交錯誤訊息
    if (formErrors.submit) {
      setFormErrors({ ...formErrors, submit: "" });
    }
  };

  const handleSubmit = async () => { // 改為 async 函式
    if (!validateForm()) { // 執行驗證
      return; // 驗證失敗，停止提交
    }

    setIsSubmitting(true); // 開始提交，設置狀態為 true

    try {
      const res = await fetch("http://localhost:5000/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json(); // 嘗試解析 JSON

      if (!res.ok) {
        // 根據後端返回的錯誤訊息來顯示
        const errorMessage = data.message || "新增失敗，請稍後再試";
        throw new Error(errorMessage);
      }

      // 直接將新增的客戶資料加入到現有的客戶列表中
      // 確保後端返回的 customer 物件結構與現有 customers 狀態一致
      if (data.customer) {
        setCustomers([...customers, data.customer]);
      } else {
        // 如果後端沒有返回 customer 物件，則重新抓取全部資料 (作為備用方案)
        console.warn("後端未返回新增的客戶物件，正在重新抓取所有客戶資料...");
        fetch("http://localhost:5000/customers")
          .then(res => res.json())
          .then(setCustomers)
          .catch(err => console.error("重新抓取客戶資料錯誤:", err));
      }


      setShowForm(false);
      setFormData({
        groom_name: "",
        bride_name: "",
        email: "",
        phone: "",
        wedding_date: "",
        form_link: "",
      });
      setFormErrors({}); // 清空錯誤訊息
      alert("客戶新增成功！"); // 顯示成功訊息

    } catch (err) {
      console.error("新增錯誤：", err);
      // 顯示更友善的錯誤訊息
      setFormErrors({ ...formErrors, submit: err.message || "新增失敗，請稍後再試" }); // 將提交錯誤放在 submit 欄位
    } finally {
      setIsSubmitting(false); // 提交結束，設置狀態為 false
    }
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
    <div className="min-h-screen bg-gray-200 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-semibold mb-8 text-center text-gray-700">
          小高婚慶後台管理系統
        </h1>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowForm(true)}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            ➕ 新增客戶
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xl transform transition-all duration-300 scale-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-700">新增客戶資訊</h2>
                {/* 關閉按鈕 */}
                <button onClick={() => {
                  setShowForm(false);
                  setFormErrors({}); // 關閉表單時清除錯誤訊息
                  setFormData({ // 關閉表單時重置表單資料
                    groom_name: "",
                    bride_name: "",
                    email: "",
                    phone: "",
                    wedding_date: "",
                    form_link: "",
                  });
                }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div> {/* 為每個輸入框及其錯誤訊息建立一個 div */}
                  <input
                    type="text"
                    name="groom_name"
                    value={formData.groom_name}
                    onChange={handleChange}
                    placeholder="新郎姓名"
                    className={`border rounded p-2 w-full ${formErrors.groom_name ? 'border-red-500' : ''}`}
                  />
                  {formErrors.groom_name && <p className="text-red-500 text-sm mt-1">{formErrors.groom_name}</p>}
                </div>

                <div>
                  <input
                    type="text"
                    name="bride_name"
                    value={formData.bride_name}
                    onChange={handleChange}
                    placeholder="新娘姓名"
                    className={`border rounded p-2 w-full ${formErrors.bride_name ? 'border-red-500' : ''}`}
                  />
                  {formErrors.bride_name && <p className="text-red-500 text-sm mt-1">{formErrors.bride_name}</p>}
                </div>

                <div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="聯絡信箱"
                    className={`border rounded p-2 w-full ${formErrors.email ? 'border-red-500' : ''}`}
                  />
                  {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
                </div>

                <div>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="聯絡電話"
                    className={`border rounded p-2 w-full ${formErrors.phone ? 'border-red-500' : ''}`}
                  />
                  {formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}
                </div>

                <div>
                  <input
                    type="datetime-local"
                    name="wedding_date"
                    value={formData.wedding_date}
                    onChange={handleChange}
                    className={`border rounded p-2 w-full ${formErrors.wedding_date ? 'border-red-500' : ''}`}
                  />
                  {formErrors.wedding_date && <p className="text-red-500 text-sm mt-1">{formErrors.wedding_date}</p>}
                </div>

                <div>
                  <input
                    type="text"
                    name="form_link"
                    value={formData.form_link}
                    onChange={handleChange}
                    placeholder="google 試算表連結"
                    className={`border rounded p-2 w-full ${formErrors.form_link ? 'border-red-500' : ''}`}
                  />
                  {formErrors.form_link && <p className="text-red-500 text-sm mt-1">{formErrors.form_link}</p>}
                </div>


                {formErrors.submit && <p className="text-red-600 text-sm mt-2 text-center">{formErrors.submit}</p>} {/* 顯示提交錯誤 */}
                <div className="flex gap-4 mt-2 justify-end">
                  <button
                    onClick={handleSubmit}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50" // 禁用狀態下的樣式
                    disabled={isSubmitting} // 提交中時禁用按鈕
                  >
                    {isSubmitting ? '提交中...' : '確認新增'} {/* 根據狀態顯示不同文字 */}
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormErrors({}); // 關閉表單時清除錯誤訊息
                      setFormData({ // 關閉表單時重置表單資料
                        groom_name: "",
                        bride_name: "",
                        email: "",
                        phone: "",
                        wedding_date: "",
                        form_link: "",
                      });
                    }}
                    className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500 disabled:opacity-50" // 禁用狀態下的樣式
                    disabled={isSubmitting} // 提交中時禁用按鈕
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        <table className="w-full text-center border-collapse">
          <thead className="bg-gray-300 text-gray-700">
            <tr>
              <th className="py-3 px-4 border-b border-gray-300 text-lg">新郎</th>
              <th className="py-3 px-4 border-b border-gray-300 text-lg">新娘</th>
              <th className="py-3 px-4 border-b border-gray-300 text-lg">聯絡方式</th>
              <th className="py-3 px-4 border-b border-gray-300 text-lg">操作</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-100">
                <td className="py-3 px-4 border-b border-gray-300 text-lg">{c.groom_name}</td>
                <td className="py-3 px-4 border-b border-gray-300 text-lg">{c.bride_name}</td>
                <td className="py-3 px-4 border-b border-gray-300 text-lg">{c.email}</td>
                <td className="py-3 px-4 border-b border-gray-300 text-lg">
                  <Link
                    to={`/customer/${c.id}`}
                    className="inline-block bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition duration-300 ease-in-out"
                  >
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {customers.length === 0 && !loading && (
          <p className="text-center text-gray-500 mt-8 text-lg">目前沒有客戶資料。</p>
        )}
      </div>
    </div>
  );
}

export default App;