import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { AppRouter } from "./router";
import { LanguageProvider } from "./LanguageProvider";

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <LanguageProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
