api.log("Custom AnF sample plugin loaded successfully!");
api.registerSidebarItem("hello", "Hello from your plugin", "✦", () => {
  api.log("Hello! This extension runs separately from your private workspace.");
});
api.on("ready", () => api.log("App ready event received in plugin."));
