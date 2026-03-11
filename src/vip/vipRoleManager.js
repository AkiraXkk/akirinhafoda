// ============================================================
//  vipRoleManager.js  —  Refatorado
//  Novidades:
//   • Posiciona o cargo pessoal abaixo do vipRoleSeparatorId
//     (lê de vipService.getGuildConfig em vez de separatorId legado)
//   • Entrega o cargo do Tier posicionado abaixo do separador VIP
//     via assignTierRole / removeTierRole
// ============================================================

module.exports = {
  createVipRoleManager({ client, vipService, logger }) {
    // ---------------------------------------------------------
    //  Cargo personalizado do usuário (/myvip role create)
    // ---------------------------------------------------------
    async function updatePersonalRole(userId, { roleName, roleColor }, { guildId }) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return { ok: false };

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false };

      const tier = await vipService.getMemberTier(member);
      if (!tier?.hasCustomRole) return { ok: false };

      const settings = vipService.getSettings(guildId, userId);
      const gConf    = vipService.getGuildConfig(guildId);

      // Usa vipRoleSeparatorId; fallback para separatorId legado
      const separatorId = gConf.vipRoleSeparatorId || gConf.separatorId;

      let role = settings.roleId
        ? await guild.roles.fetch(settings.roleId).catch(() => null)
        : null;

      const parsedColor = roleColor
        ? (typeof roleColor === "string" ? parseInt(roleColor.replace("#", ""), 16) : roleColor)
        : 0;

      if (!role) {
        try {
          role = await guild.roles.create({
            name:   roleName || `VIP | ${member.user.username}`,
            color:  parsedColor,
            reason: "Cargo personalizado VIP criado",
          });
        } catch (err) {
          console.error(`[VIP] Falha ao criar cargo personalizado para userId=${userId} guildId=${guildId}:`, err.message, `(code: ${err.code})`);
          logger?.error?.({ err, userId, guildId }, "Falha ao criar cargo personalizado VIP");
          return { ok: false, reason: `Não foi possível criar o cargo: ${err.message}` };
        }

        if (separatorId) {
          const sep = await guild.roles.fetch(separatorId).catch(() => null);
          if (sep) {
            // Garante que o bot não tente posicionar o cargo acima do seu próprio cargo mais alto
            const botMember = await guild.members.fetchMe().catch(() => null);
            const botHighestPos = botMember?.roles?.highest?.position ?? 0;
            const targetPos = sep.position - 1;
            const safePos = Math.min(targetPos, botHighestPos - 1);
            await role.setPosition(safePos).catch((err) => {
              console.error(`[VIP] Falha ao posicionar cargo personalizado roleId=${role.id}:`, err.message);
              logger?.error?.({ err, roleId: role.id }, "Falha ao posicionar cargo personalizado");
            });
          }
        }
      } else {
        if (roleName)  await role.setName(roleName).catch(() => {});
        if (roleColor) await role.setColor(parsedColor).catch(() => {});
      }

      await member.roles.add(role).catch((err) =>
        logger?.error?.({ err, userId, roleId: role.id }, "Falha ao adicionar cargo personalizado VIP — verifique a hierarquia de cargos do bot")
      );
      await vipService.setSettings(guildId, userId, { roleId: role.id });
      return { ok: true };
    }

    async function deletePersonalRole(userId, { guildId }) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return { ok: false };

      const settings = vipService.getSettings(guildId, userId);
      if (settings?.roleId) {
        const role = await guild.roles.fetch(settings.roleId).catch(() => null);
        if (role) await role.delete("VIP expirado — cargo pessoal removido").catch(() => {});
      }
      return { ok: true };
    }

    // ---------------------------------------------------------
    //  Cargo do Tier (cargo específico ex: "VIP Imperial")
    //  Posiciona abaixo do vipRoleSeparatorId ao entregar.
    // ---------------------------------------------------------
    async function assignTierRole(userId, tierId, { guildId }) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return { ok: false };

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false };

      const tier = await vipService.getTierConfig(guildId, tierId);
      if (!tier?.roleId) return { ok: false };

      await member.roles.add(tier.roleId).catch((err) =>
        logger?.error?.({ err, userId, tierId }, "Falha ao adicionar cargo de tier")
      );

      // Posiciona o cargo do tier abaixo do separador VIP
      const gConf      = vipService.getGuildConfig(guildId);
      const separatorId = gConf.vipRoleSeparatorId || gConf.separatorId;
      if (separatorId) {
        const sep      = await guild.roles.fetch(separatorId).catch(() => null);
        const tierRole = await guild.roles.fetch(tier.roleId).catch(() => null);
        if (sep && tierRole) {
          const botMember = await guild.members.fetchMe().catch(() => null);
          const botHighestPos = botMember?.roles?.highest?.position ?? 0;
          const safePos = Math.min(sep.position - 1, botHighestPos - 1);
          await tierRole.setPosition(safePos).catch((err) => {
            console.error(`[VIP] Falha ao posicionar cargo de tier tierId=${tierId}:`, err.message);
          });
        }
      }

      return { ok: true };
    }

    async function removeTierRole(userId, tierId, { guildId }) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return { ok: false };

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false };

      const tier = await vipService.getTierConfig(guildId, tierId);
      if (!tier?.roleId) return { ok: false };

      await member.roles.remove(tier.roleId).catch((err) =>
        logger?.error?.({ err, userId, tierId }, "Falha ao remover cargo de tier")
      );
      return { ok: true };
    }

    return {
      updatePersonalRole,
      deletePersonalRole,
      assignTierRole,
      removeTierRole,
    };
  },
};
