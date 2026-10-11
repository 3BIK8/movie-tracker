import {
  SignInButton,
  Show,
  UserButton,
  useAuth,
} from "@clerk/react";
import App from "./App.jsx";
import { setAuthTokenProvider } from "./services/api";

export default function AuthenticatedApp() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  setAuthTokenProvider(getToken);

  if (!isLoaded) {
    return <main className="auth-gate"><p>Loading account…</p></main>;
  }

  if (!isSignedIn) {
    return (
      <main className="auth-gate">
        <h1>Movie Tracker</h1>
        <p>Sign in to access your library and recommendations.</p>
        <SignInButton mode="modal">
          <button type="button">Sign in</button>
        </SignInButton>
      </main>
    );
  }

  return (
    <Show when="signed-in">
      <div className="account-control">
        <UserButton />
      </div>
      <App />
    </Show>
  );
}
