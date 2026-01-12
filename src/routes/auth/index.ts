/**
 * Auth Routes
 *
 * Combines all authentication route modules.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/bindings";

import { register } from "./register";
import { login } from "./login";
import { refresh } from "./refresh";
import { logout } from "./logout";
import { me } from "./me";
import { password } from "./password";

const auth = new Hono<AppEnv>();

// Mount route modules
auth.route("/register", register);
auth.route("/login", login);
auth.route("/refresh", refresh);
auth.route("/logout", logout);
auth.route("/me", me);
auth.route("/password", password);

export { auth };
