"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  AI_FEATURES,
  AI_MODEL_PRESETS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  type AiProvider,
  type AiSettings,
} from "@/domain/ai";

const CUSTOM_MODEL = "__custom";

export function AiIntegrationForm({
  settings,
  keyConfigured,
}: {
  settings: AiSettings;
  keyConfigured: Record<AiProvider, boolean>;
}) {
  const { t } = useLocale();
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form className="card reminder-settings-form" onSubmit={save}>
      <div className="form-grid">
        <label className="ai-enable-row form-wide">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>
            <strong>{t("aiEnableIntegration")}</strong>
            <small>{t("aiEnableIntegrationHelp")}</small>
          </span>
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
            <small className="muted">{t("aiApiKeyHelp")}</small>
          </label>
          <fieldset className="access-section form-wide">
            <legend>{t("aiEnabledSections")}</legend>
            <p className="muted">{t("aiEnabledSectionsHelp")}</p>
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
                <span>
                  <strong>{t(`aiFeature_${feature}`)}</strong>
                  <small>{t(`aiFeatureHelp_${feature}`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </fieldset>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice notice-success">{message}</p>}
      <button className="button" disabled={busy}>
        {busy ? t("saving") : t("saveSettings")}
      </button>
    </form>
  );
}
