import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function App() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:5000/customers")
      .then((res) => {
        if (!res.ok) {
          throw new Error("API request failed: " + res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        setCustomers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
        setError("Unable to load customer data. Please try again later.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-200">
        <p className="text-gray-600 text-xl">Loading...</p>
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
          <p className="text-center text-gray-500 mt-8 text-lg">No customer data available.</p>
        )}
      </div>
    </div>
  );
}

export default App;
