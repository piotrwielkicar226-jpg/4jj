package com.piotr.firetrail;

import org.bukkit.plugin.java.JavaPlugin;

public class FireTrail extends JavaPlugin {
    private boolean globalEnabled = true;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        getServer().getPluginManager().registerEvents(new TrailListener(this), this);
        getCommand("firetrail").setExecutor((sender, cmd, label, args) -> {
            globalEnabled = !globalEnabled;
            sender.sendMessage("§6[FireTrail] §fOgnisty slad: " + (globalEnabled ? "§aWLACZONY" : "§cWYLACZONY"));
            return true;
        });
        getLogger().info("FireTrail wlaczony!");
    }

    public boolean isGlobalEnabled() { return globalEnabled; }
}