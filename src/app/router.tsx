import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../pages/Login";
import { RegisterPage } from "../pages/Register";
import { HomePage } from "../pages/Home";
import { ProfilePage } from "../pages/Profile";
import { RestaurantDetailsPage } from "../pages/RestaurantDetails";
import { FriendsPage } from "../pages/Friends";
import { SpaceDetailsPage } from "../pages/SpaceDetails";
import { StatisticsPage } from "../pages/Statistics";
import { SpaceStatisticsPage } from "../pages/SpaceStatistics";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { Header } from "../components/Header";
import { useAuth } from "./AuthProvider";

function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-center">Loading...</div>;
  }
  return <Navigate to={user ? "/app" : "/login"} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<IndexRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Header />}>
          <Route path="/app" element={<HomePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/statistics/:id" element={<SpaceStatisticsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/spaces/:id" element={<SpaceDetailsPage />} />
          <Route path="/restaurants/:id" element={<RestaurantDetailsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
