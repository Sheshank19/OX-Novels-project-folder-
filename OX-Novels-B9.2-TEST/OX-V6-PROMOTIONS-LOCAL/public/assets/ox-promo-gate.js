window.oxPromoGate = async function () {
  try {
    const response = await fetch("/api/promo/sources", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Unable to load promotion sources.");

    const data = await response.json();
    if (data.selected) return true;

    return await new Promise(resolve => {
      const layer = document.createElement("div");
      layer.style.cssText =
        "position:fixed;inset:0;z-index:2147483600;" +
        "background:rgba(0,0,0,.78);display:flex;" +
        "align-items:center;justify-content:center;padding:18px";

      const card = document.createElement("section");
      card.style.cssText =
        "width:min(440px,100%);background:#151b24;" +
        "color:white;border:1px solid #3e4756;border-radius:16px;" +
        "padding:24px;font:15px system-ui;box-sizing:border-box";

      const title = document.createElement("h2");
      title.textContent = "How did you hear about OX Novels?";
      title.style.margin = "0 0 10px";

      const description = document.createElement("p");
      description.textContent =
        "Select the YouTube channel or other source that introduced you to our website.";
      description.style.color = "#bec9d5";

      const select = document.createElement("select");
      select.style.cssText =
        "width:100%;padding:12px;border-radius:8px;" +
        "margin:10px 0;background:#293242;color:white";

      select.add(new Option("Choose a source", ""));
      select.add(new Option("OX Novels — Official YouTube", "owner"));

      for (const partner of data.partners || []) {
        select.add(new Option(partner.channel_name + " — YouTube", partner.id));
      }

      select.add(new Option("Other", "other"));

      const other = document.createElement("input");
      other.placeholder = "Mention the YouTube channel or other source";
      other.maxLength = 120;
      other.style.cssText =
        "display:none;width:100%;padding:12px;box-sizing:border-box;" +
        "border-radius:8px;margin-bottom:12px";
      select.onchange = () => {
        other.style.display = select.value === "other" ? "block" : "none";
      };

      const message = document.createElement("p");
      message.style.color = "#ffb6b6";

      const buttons = document.createElement("div");
      buttons.style.cssText = "display:flex;gap:10px;justify-content:flex-end";

      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.type = "button";

      const confirm = document.createElement("button");
      confirm.textContent = "Continue";
      confirm.type = "button";
      confirm.style.cssText =
        "background:#13c3b3;color:#082323;font-weight:700;" +
        "border:0;border-radius:8px;padding:12px 18px";

      const close = success => {
        layer.remove();
        resolve(success);
      };

      cancel.onclick = () => close(false);

      confirm.onclick = async () => {
        if (!select.value) {
          message.textContent = "Please choose where you heard about us.";
          return;
        }

        if (select.value === "other" && !other.value.trim()) {
          message.textContent = "Please mention the source.";
          return;
        }

        confirm.disabled = true;
        message.textContent = "";

        try {
          const sourceType =
            select.value === "owner" ? "owner" :
            select.value === "other" ? "other" : "partner";

          const saved = await fetch("/api/promo/choose", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sourceType,
              partnerId: sourceType === "partner" ? select.value : "",
              otherSource: other.value.trim()
            })
          });

          const result = await saved.json();
          if (!saved.ok) throw new Error(result.error || "Unable to save source.");

          close(true);
        } catch (error) {
          message.textContent = error.message;
          confirm.disabled = false;
        }
      };

      buttons.append(cancel, confirm);
      card.append(title, description, select, other, message, buttons);
      layer.append(card);
      document.body.append(layer);
    });
  } catch (error) {
    alert(error.message || "Unable to confirm promotion source.");
    return false;
  }
};
