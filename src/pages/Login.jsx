import React, { useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  FaRegEnvelope,
  FaLock,
  FaArrowRight,
  FaRegCalendarAlt,
  FaBoxOpen,
  FaChartBar,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { ApiURL } from "../api";
import { persistSession, isSessionRemembered } from "../auth";
// White, transparent mark — sits on the dark brand panel without a matte box.
import logoLight from "../assets/RentangadiLogo5.png";

/**
 * Admin sign-in.
 *
 * The brand panel's photographic backdrop is optional: drop an image at
 * public/login-bg.jpg and it appears behind the gradient. Without it the
 * gradient alone carries the panel, so nothing breaks if the file is absent.
 */

const REMEMBER_KEY = "ra.login.email";

const FEATURES = [
  { icon: FaRegCalendarAlt, title: "Streamline", sub: "Event Bookings" },
  { icon: FaBoxOpen, title: "Track Inventory", sub: "in Real Time" },
  { icon: FaChartBar, title: "Grow Your", sub: "Rental Business" },
];

const Login = ({ handleLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setEmail(saved);
    } catch (err) {
      /* private mode or blocked storage: nothing to restore */
    }
    setRemember(isSessionRemembered());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${ApiURL}/adminLogin`, {
        email,
        password,
      });
      if (response.status === 200) {
        toast.success("Login successful");
        sessionStorage.setItem("token", response.data.token);
        sessionStorage.setItem(
          "permissions",
          JSON.stringify(response.data.permissions)
        );
        try {
          if (remember) localStorage.setItem(REMEMBER_KEY, email);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch (err) {
          /* storage blocked; the sign-in itself still succeeded */
        }
        /* Mirrors the session so it survives closing the browser. Runs after
           the sessionStorage writes above, which are its source. */
        persistSession(remember);
        setTimeout(() => {
          handleLogin && handleLogin(response.data.permissions);
          navigate("/dashboard");
        }, 1000);
      } else {
        toast.error("Login failed");
      }
    } catch (error) {
      toast.error("Invalid credentials or server error");
    } finally {
      setLoading(false);
    }
  };

  /* There is no self-service reset endpoint, so this says what actually
     happens rather than pretending to send a mail. */
  const handleForgot = () =>
    toast("Ask your administrator to reset the password for this account.", {
      icon: "🔑",
    });

  return (
    <div className="lg">
      {/* ---- Brand panel ---- */}
      <aside className="lg__brand">
        <div className="lg__brand-inner">
          <img src={logoLight} alt="Rent Angadi" className="lg__logo" />

          <span className="lg__eyebrow">
            <i aria-hidden="true" />
            Premium Event Furniture Rentals
          </span>

          <h1 className="lg__headline">
            Cherished
            <br />
            moments,
            <br />
            <em>refined furniture.</em>
          </h1>

          <p className="lg__blurb">
            Manage enquiries, quotations, orders
            <br />
            and inventory from a single place.
          </p>

          <ul className="lg__features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="lg__ficon">
                  <f.icon />
                </span>
                <span className="lg__ftext">
                  <strong>{f.title}</strong>
                  <span>{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="lg__legal">
          &copy; {new Date().getFullYear()} Rent Angadi. All rights reserved.
        </p>
      </aside>

      {/* ---- Form panel ---- */}
      <main className="lg__panel">
        <div className="lg__card">
          <h2 className="lg__title">Welcome back</h2>
          <p className="lg__sub">Sign in to your Rent Angadi admin account.</p>

          <Form onSubmit={handleSubmit} autoComplete="off" noValidate>
            <div className="lg__group">
              <label className="lg__label" htmlFor="lg-email">
                Email <span className="lg__req">*</span>
              </label>
              <div className="lg__field">
                <FaRegEnvelope className="lg__field-icon" />
                <input
                  id="lg-email"
                  type="email"
                  placeholder="admin@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="lg__group">
              <label className="lg__label" htmlFor="lg-password">
                Password <span className="lg__req">*</span>
              </label>
              <div className="lg__field">
                <FaLock className="lg__field-icon" />
                <input
                  id="lg-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lg__peek"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
                </button>
              </div>
            </div>

            <div className="lg__row">
              <label className="lg__check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>

              <button
                type="button"
                className="lg__link"
                onClick={handleForgot}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="lg__submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
              {loading ? null : <FaArrowRight />}
            </button>
          </Form>

          <hr className="lg__divider" />

          <p className="lg__foot">
            Trouble signing in? Contact your administrator.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
