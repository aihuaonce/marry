import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import App from "./App";
import CustomerDetails from "./CustomerDetails";

function Main() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/customer/:id" element={<CustomerDetails />} />
            </Routes>
        </Router>
    );
}

export default Main;
