package com.piotr.firetrail;

import org.bukkit.*;
import org.bukkit.block.Block;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.scheduler.BukkitRunnable;

public class TrailListener implements Listener {
    private final FireTrail plugin;
    public TrailListener(FireTrail plugin) { this.plugin = plugin; }

    @EventHandler
    public void onShoot(ProjectileLaunchEvent e) {
        if (!(e.getEntity() instanceof Arrow arrow)) return;
        if (!(e.getEntity().getShooter() instanceof Player)) return;

        // tylko ogniste strzaly
        new BukkitRunnable() {
            @Override
            public void run() {
                if (arrow.isDead() || arrow.isOnGround() || !arrow.isValid()) {
                    cancel();
                    return;
                }
                if (arrow.getFireTicks() <= 0 && !plugin.isGlobalEnabled()) return;
                // musi byc ognista lub global wlaczony
                if (arrow.getFireTicks() <= 0) return;

                Location loc = arrow.getLocation();
                World w = loc.getWorld();
                if (w == null) return;

                if (plugin.getConfig().getBoolean("trail.particles", true)) {
                    int amount = plugin.getConfig().getInt("trail.particle-amount", 3);
                    w.spawnParticle(Particle.FLAME, loc, amount, 0.1, 0.1, 0.1, 0.01);
                    w.spawnParticle(Particle.SMOKE_NORMAL, loc, 1, 0.1, 0.1, 0.1, 0.01);
                }

                if (plugin.getConfig().getBoolean("trail.set-fire-blocks", true)) {
                    Block b = loc.getBlock();
                    Block below = b.getRelative(0, -1, 0);
                    if (b.getType() == Material.AIR && below.getType().isSolid()) {
                        b.setType(Material.FIRE);
                        int duration = plugin.getConfig().getInt("trail.fire-duration-ticks", 60);
                        Bukkit.getScheduler().runTaskLater(plugin, () -> {
                            if (b.getType() == Material.FIRE) b.setType(Material.AIR);
                        }, duration);
                    }
                }
            }
        }.runTaskTimer(plugin, 0L, 1L);
    }
}