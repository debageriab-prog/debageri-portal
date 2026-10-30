"use client";

import { FormEvent, useRef, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  AI_FEATURES,
  AI_MODEL_PRESETS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  type AiProvider,
  type AiSettings,
} from "@/domain/ai";

const CUSTOM_MODEL = "__custom";

type Tab = "provider" | "sections";
const TABS: Tab[] = ["provider", "sections"];

export function AiIntegrationForm({
  settings,
  keyConfigured,
}: {
  settings: AiSettings;
  keyConfigured: Record<AiProvider, boolean>;
}) {
  const { t } = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<Tab>("provider");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [modelChoice, setModelChoice] = useState(
    AI_MODEL_PRESETS[settings.provider].includes(settings.model)
      ? settings.model
      : CUSTOM_MODEL,
  );
  const [customModel, setCustomModel] = useState(
    AI_MODEL_PRESETS[settings.provider].includes(settings.model)
      ? ""
      : settings.model,
  );
  const [features, setFeatures] = useState(settings.features);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /** Switches to the tab holding the first invalid field and reports it. */
  function revealInvalidField() {
    const invalid = formRef.current?.querySelector<HTMLInputElement>(
      "input:invalid, select:invalid",
    );
    if (!invalid) return false;
    const panel = invalid.closest<HTMLElement>("[data-tab]");
    if (panel) setTab(panel.dataset.tab as Tab);
    window.setTimeout(() => invalid.reportValidity(), 0);
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (revealInvalidField()) return;
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await appCheckFetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          provider,
          model: modelChoice === CUSTOM_MODEL ? customModel : modelChoice,
          apiKey: String(form.get("apiKey") ?? "").trim() || undefined,
          features,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          t(
            result.error === "aiNotConfigured"
              ? "aiApiKeyRequired"
              : "aiSettingsSaveFailed",
          ),
        );
      setMessage(t("aiSettingsSaved"));
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="card employee-editor"
      onSubmit={save}
      noValidate
    >
      <div
        className="editor-tabs"
        role="tablist"
        aria-label={t("aiIntegration")}
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`ai-tab-${item}`}
            aria-controls={`ai-panel-${item}`}
            aria-selected={tab === item}
            className={`editor-tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {t(`aiTab_${item}`)}
          </button>
        ))}
      </div>

      <section
        className="editor-panel"
        data-tab="provider"
        role="tabpanel"
        id="ai-panel-provider"
        aria-labelledby="ai-tab-provider"
        hidden={tab !== "provider"}
      >
        <div className="form-grid">
          <label className="checkbox-row form-wide">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>{t("aiEnableIntegration")}</span>
            <InfoTip text={t("aiEnableIntegrationHelp")} />
          </label>
          <fieldset
            className="ai-settings-fields form-grid form-wide"
            disabled={!enabled}
          >
            <label>
              {t("aiProvider")}
              <select
                className="field"
                value={provider}
                onChange={(event) => {
                  const next = event.target.value as AiProvider;
                  setProvider(next);
                  setModelChoice(DEFAULT_AI_MODEL[next]);
                  setCustomModel("");
                }}
              >
                {AI_PROVIDERS.map((item) => (
                  <option key={item} value={item}>
                    {t(`aiProvider_${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("aiModel")}
              <select
                className="field"
                value={modelChoice}
                onChange={(event) => setModelChoice(event.target.value)}
              >
                {AI_MODEL_PRESETS[provider].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                <option value={CUSTOM_MODEL}>{t("aiCustomModel")}</option>
              </select>
            </label>
            {modelChoice === CUSTOM_MODEL && (
              <label>
                {t("aiCustomModelId")}
                <input
                  className="field"
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  pattern="[A-Za-z0-9._:/\-]+"
                  required
                />
              </label>
            )}
            <label className="form-wide">
              {t("aiApiKey").replace("{provider}", t(`aiProvider_${provider}`))}
              <InfoTip text={t("aiApiKeyHelp")} />
              <input
                className="field"
                name="apiKey"
                type="password"
                autoComplete="off"
                key={provider}
                placeholder={
                  keyConfigured[provider] ? t("aiLeaveBlankApiKey") : ""
                }
                required={enabled && !keyConfigured[provider]}
              />
            </label>
          </fieldset>
        </div>
      </section>

      <section
        className="editor-panel"
        data-tab="sections"
        role="tabpanel"
        id="ai-panel-sections"
        aria-labelledby="ai-tab-sections"
        hidden={tab !== "sections"}
      >
        <p className="muted editor-panel-intro">{t("aiEnabledSectionsHelp")}</p>
        {!enabled && (
          <p className="notice notice-warning">{t("aiSectionsDisabled")}</p>
        )}
        <fieldset className="ai-settings-fields" disabled={!enabled}>
          <fieldset className="access-section">
            <legend>{t("aiEnabledSections")}</legend>
            {AI_FEATURES.map((feature) => (
              <label className="checkbox-row" key={feature}>
                <input
                  type="checkbox"
                  checked={features[feature]}
                  onChange={(event) =>
                    setFeatures({
                      ...features,
                      [feature]: event.target.checked,
                    })
                  }
                />
                <span>{t(`aiFeature_${feature}`)}</span>
                <InfoTip text={t(`aiFeatureHelp_${feature}`)} />
              </label>
            ))}
          </fieldset>
        </fieldset>
      </section>

      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice notice-success">{message}</p>}
      <footer className="modal-actions editor-actions">
        <button className="button" disabled={busy}>
          {busy ? t("saving") : t("saveSettings")}
        </button>
      </footer>
    </form>
  );
}
