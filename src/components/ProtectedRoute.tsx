import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-center">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
