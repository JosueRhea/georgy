import { Routes, Route, useLocation } from "react-router-dom";
import CreateSession from "./pages/CreateSession";
import SessionOrder from "./pages/SessionOrder";

function App() {
  const location = useLocation();
  return (
    <Routes>
      <Route path="/" element={<CreateSession />} />
      <Route path="/s/:sessionId" element={<SessionOrder key={location.pathname} />} />
    </Routes>
  );
}

export default App;
