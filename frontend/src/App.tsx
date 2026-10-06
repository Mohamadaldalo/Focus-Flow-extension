import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AllowList   from "./pages/AllowList";
import Dashboard   from "./pages/Dashboard";
import ExamControl from "./pages/ExamControl";
import Login       from "./pages/Login";
import Session     from "./pages/Session";
import Settings    from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login"     element={<Login />} />
      <Route path="/"          element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/session"   element={<ProtectedRoute><Session /></ProtectedRoute>} />
      <Route path="/allowlist" element={<ProtectedRoute><AllowList /></ProtectedRoute>} />
      <Route path="/settings"  element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/exam"      element={<ProtectedRoute><ExamControl /></ProtectedRoute>} />
    </Routes>
  );
}