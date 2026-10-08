import { useEffect, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import {
  getAuthOptions,
  loginWithAccount,
  loginWithLegacyPassword,
  registerOrganization,
  type AuthFailureReason,
} from "../api/client";

type Mode = "landing" | "login" | "register" | "legacy";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  login: string;
  register: string;
  features: Array<{ number: string; title: string; text: string }>;
  promise: string;
  loginTitle: string;
  loginText: string;
  registerTitle: string;
  registerText: string;
  legacyTitle: string;
  legacyText: string;
  email: string;
  password: string;
  name: string;
  organization: string;
  invite: string;
  passwordHint: string;
  submitLogin: string;
  submitRegister: string;
  submitLegacy: string;
  legacyLink: string;
  back: string;
  errors: Record<AuthFailureReason, string>;
};

const copy: Record<Lang, Copy> = {
  it: {
    eyebrow: "Il ristorante, come un unico sistema",
    title: "Dati operativi che accompagnano ogni servizio.",
    intro: "CookOps collega acquisti, stock, inventari, tracciabilità e HACCP in uno spazio protetto per ogni organizzazione.",
    login: "Accedi",
    register: "Crea il tuo spazio",
    features: [
      { number: "01", title: "Stock leggibile", text: "Prodotti, fornitori e inventari restano nello stesso flusso." },
      { number: "02", title: "Operazioni coordinate", text: "Documenti, controlli e attività quotidiane parlano tra loro." },
      { number: "03", title: "Dati separati", text: "Ogni organizzazione lavora nel proprio perimetro protetto." },
    ],
    promise: "Costruito sul lavoro reale, non su un processo teorico.",
    loginTitle: "Bentornato",
    loginText: "Accedi con il tuo account personale CookOps.",
    registerTitle: "Crea la tua organizzazione",
    registerText: "Durante la fase pilota, la creazione di nuovi spazi è disponibile su invito.",
    legacyTitle: "Storico ChefSide",
    legacyText: "Usa la password esistente per accedere ai dati operativi del campeggio.",
    email: "Email professionale",
    password: "Password",
    name: "Nome e cognome",
    organization: "Nome dell'organizzazione",
    invite: "Codice d'invito",
    passwordHint: "Almeno 12 caratteri.",
    submitLogin: "Entra nel tuo spazio",
    submitRegister: "Crea organizzazione",
    submitLegacy: "Accedi allo storico",
    legacyLink: "Accesso storico ChefSide",
    back: "Torna alla presentazione",
    errors: {
      invalid_credentials: "Email o password non corrette.",
      invalid_invite: "Il codice d'invito non è valido.",
      invalid_registration: "Controlla i dati e usa una password di almeno 12 caratteri.",
      account_exists: "Esiste già un account con questa email.",
      registration_disabled: "Le iscrizioni non sono ancora aperte.",
      rate_limited: "Troppi tentativi. Attendi qualche minuto.",
      offline: "Il server non è raggiungibile. Riprova tra poco.",
      invalid_response: "La risposta del server non è valida.",
    },
  },
  fr: {
    eyebrow: "Le restaurant comme un seul système",
    title: "Des données opérationnelles qui suivent chaque service.",
    intro: "CookOps relie achats, stocks, inventaires, traçabilité et HACCP dans un espace protégé pour chaque organisation.",
    login: "Se connecter",
    register: "Créer votre espace",
    features: [
      { number: "01", title: "Un stock lisible", text: "Produits, fournisseurs et inventaires restent dans le même flux." },
      { number: "02", title: "Des opérations coordonnées", text: "Documents, contrôles et tâches quotidiennes communiquent." },
      { number: "03", title: "Des données séparées", text: "Chaque organisation travaille dans son propre périmètre protégé." },
    ],
    promise: "Construit à partir du travail réel, pas d'un processus théorique.",
    loginTitle: "Heureux de vous revoir",
    loginText: "Connectez-vous avec votre compte personnel CookOps.",
    registerTitle: "Créer votre organisation",
    registerText: "Pendant la phase pilote, la création d'espaces est disponible sur invitation.",
    legacyTitle: "Historique ChefSide",
    legacyText: "Utilisez le mot de passe existant pour accéder aux données du camping.",
    email: "E-mail professionnel",
    password: "Mot de passe",
    name: "Nom et prénom",
    organization: "Nom de l'organisation",
    invite: "Code d'invitation",
    passwordHint: "12 caractères minimum.",
    submitLogin: "Entrer dans votre espace",
    submitRegister: "Créer l'organisation",
    submitLegacy: "Accéder à l'historique",
    legacyLink: "Accès historique ChefSide",
    back: "Retour à la présentation",
    errors: {
      invalid_credentials: "E-mail ou mot de passe incorrect.",
      invalid_invite: "Le code d'invitation n'est pas valide.",
      invalid_registration: "Vérifiez les données et utilisez un mot de passe d'au moins 12 caractères.",
      account_exists: "Un compte existe déjà avec cet e-mail.",
      registration_disabled: "Les inscriptions ne sont pas encore ouvertes.",
      rate_limited: "Trop de tentatives. Attendez quelques minutes.",
      offline: "Le serveur est inaccessible. Réessayez dans un instant.",
      invalid_response: "La réponse du serveur n'est pas valide.",
    },
  },
  en: {
    eyebrow: "The restaurant as one connected system",
    title: "Operational data that follows every service.",
    intro: "CookOps connects purchasing, stock, inventory, traceability and HACCP inside a protected workspace for each organisation.",
    login: "Sign in",
    register: "Create your workspace",
    features: [
      { number: "01", title: "Readable stock", text: "Products, suppliers and inventory stay in one continuous flow." },
      { number: "02", title: "Coordinated operations", text: "Documents, controls and daily tasks communicate." },
      { number: "03", title: "Separated data", text: "Each organisation works inside its own protected boundary." },
    ],
    promise: "Built around real work, not a theoretical process.",
    loginTitle: "Welcome back",
    loginText: "Sign in with your personal CookOps account.",
    registerTitle: "Create your organisation",
    registerText: "During the pilot phase, new workspaces are available by invitation.",
    legacyTitle: "ChefSide history",
    legacyText: "Use the existing password to access the campsite's operational data.",
    email: "Work email",
    password: "Password",
    name: "Full name",
    organization: "Organisation name",
    invite: "Invitation code",
    passwordHint: "At least 12 characters.",
    submitLogin: "Enter your workspace",
    submitRegister: "Create organisation",
    submitLegacy: "Access historic workspace",
    legacyLink: "Historic ChefSide access",
    back: "Back to overview",
    errors: {
      invalid_credentials: "Incorrect email or password.",
      invalid_invite: "The invitation code is not valid.",
      invalid_registration: "Check the details and use a password of at least 12 characters.",
      account_exists: "An account already exists for this email.",
      registration_disabled: "Registration is not open yet.",
      rate_limited: "Too many attempts. Please wait a few minutes.",
      offline: "The server is unavailable. Please try again shortly.",
      invalid_response: "The server response is invalid.",
    },
  },
};

type Props = {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onAuthenticated: () => void;
};

export default function AuthPortal({ lang, onLangChange, onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [legacyLoginEnabled, setLegacyLoginEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = copy[lang];

  useEffect(() => {
    getAuthOptions().then((options) => {
      setRegistrationEnabled(options.registrationEnabled);
      setLegacyLoginEnabled(options.legacyLoginEnabled);
    });
  }, []);

  const open = (nextMode: Mode) => {
    setMode(nextMode);
    setError("");
    setPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = mode === "register"
      ? await registerOrganization({ email, password, displayName, organizationName, inviteCode })
      : mode === "legacy"
        ? await loginWithLegacyPassword(password)
        : await loginWithAccount(email, password);
    setBusy(false);
    if (result.ok) {
      onAuthenticated();
      return;
    }
    setError(c.errors[result.reason]);
  };

  return (
    <main className="auth-portal">
      <header className="auth-nav">
        <button className="auth-brand" type="button" onClick={() => open("landing")}>
          <img src="/chefside-logo.svg" alt="Chef Side" />
          <span>CookOps</span>
        </button>
        <div className="auth-nav-actions">
          <select value={lang} onChange={(event) => onLangChange(event.target.value as Lang)} aria-label="Language">
            <option value="it">IT</option><option value="fr">FR</option><option value="en">EN</option>
          </select>
          {mode === "landing" ? <button type="button" onClick={() => open("login")}>{c.login}</button> : null}
        </div>
      </header>

      {mode === "landing" ? (
        <>
          <section className="auth-hero">
            <div className="auth-hero-copy">
              <p className="auth-eyebrow"><span />{c.eyebrow}</p>
              <h1>{c.title}</h1>
              <p className="auth-intro">{c.intro}</p>
              <div className="auth-actions">
                <button className="auth-primary" type="button" onClick={() => open("login")}>{c.login}</button>
                {registrationEnabled ? <button className="auth-secondary" type="button" onClick={() => open("register")}>{c.register}</button> : null}
              </div>
            </div>
            <div className="auth-map" aria-hidden="true">
              <div className="auth-map-core">OPS</div>
              <span className="auth-node auth-node--stock">STOCK</span>
              <span className="auth-node auth-node--haccp">HACCP</span>
              <span className="auth-node auth-node--cost">COST</span>
              <span className="auth-node auth-node--trace">TRACE</span>
            </div>
          </section>
          <section className="auth-features">
            {c.features.map((feature) => <article key={feature.number}><span>{feature.number}</span><h2>{feature.title}</h2><p>{feature.text}</p></article>)}
          </section>
          <p className="auth-promise">{c.promise}</p>
        </>
      ) : (
        <section className="auth-form-layout">
          <div className="auth-form-copy">
            <button className="auth-back" type="button" onClick={() => open("landing")}>← {c.back}</button>
            <span className="auth-index">{mode === "login" ? "01" : mode === "register" ? "02" : "03"}</span>
            <h1>{mode === "login" ? c.loginTitle : mode === "register" ? c.registerTitle : c.legacyTitle}</h1>
            <p>{mode === "login" ? c.loginText : mode === "register" ? c.registerText : c.legacyText}</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {mode === "register" ? <>
              <label>{c.name}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label>
              <label>{c.organization}<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" required /></label>
            </> : null}
            {mode !== "legacy" ? <label>{c.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label> : null}
            <label>{c.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : undefined} required />{mode === "register" ? <small>{c.passwordHint}</small> : null}</label>
            {mode === "register" ? <label>{c.invite}<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required /></label> : null}
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-primary" type="submit" disabled={busy}>{busy ? "…" : mode === "login" ? c.submitLogin : mode === "register" ? c.submitRegister : c.submitLegacy}</button>
            {mode === "login" && legacyLoginEnabled ? <button className="auth-legacy-link" type="button" onClick={() => open("legacy")}>{c.legacyLink}</button> : null}
          </form>
        </section>
      )}
      <footer className="auth-footer"><span>chefside.fr</span><span>CookOps · private pilot</span></footer>
    </main>
  );
}
