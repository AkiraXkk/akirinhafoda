const { createDataStore } = require("../store/dataStore");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { logger } = require("../logger");

function createFamilyService() {
  const familyStore = createDataStore("families.json");

  async function getAllFamilies() {
    return await familyStore.load();
  }

  async function getFamilyByOwner(userId) {
    const families = await getAllFamilies();
    return Object.values(families).find(f => f.ownerId === userId);
  }

  async function getFamilyByMember(userId) {
    const families = await getAllFamilies();
    return Object.values(families).find(f => f.members.includes(userId));
  }
  
  async function getFamilyById(familyId) {
      const families = await getAllFamilies();
      return families[familyId];
  }

  async function createFamilyFull(guild, owner, name, vipService) {
      const families = await getAllFamilies();
      const userId = owner.id;

      if (Object.values(families).some(f => f.ownerId === userId)) {
          throw new Error("Você já é dono de uma família!");
      }

      // 1. Create Role
      let role;
      try {
          role = await guild.roles.create({
              name: `Família ${name}`,
              color: 0x9B59B6,
              reason: `Família criada por ${owner.user.tag}`
          });

          const guildConfig = vipService.getGuildConfig(guild.id) || {};
          const separatorId = guildConfig.familySeparatorRoleId;
          const botMember = guild.members.me;

          if (separatorId && botMember) {
              const separatorRole = await guild.roles.fetch(separatorId).catch(() => null);
              if (separatorRole && botMember.roles.highest.comparePositionTo(separatorRole) > 0) {
                  await role.setPosition(separatorRole.position - 1).catch(() => {});
              }
          }

          await owner.roles.add(role).catch(() => {});
      } catch (e) {
          throw new Error("Erro ao criar cargo. Verifique permissões do bot.");
      }

      // 2. Create Channels
      const guildConfig = vipService.getGuildConfig(guild.id);
      let textChannelId = null;
      let voiceChannelId = null;

      const familyCategoryId = guildConfig?.familyCategoryId || guildConfig?.vipCategoryId;

      if (familyCategoryId) {
          try {
              const text = await guild.channels.create({
                  name: `🏰・${name}`,
                  type: ChannelType.GuildText,
                  parent: familyCategoryId,
                  permissionOverwrites: [
                      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                      { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                      { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
                  ]
              });
              textChannelId = text.id;

              const voice = await guild.channels.create({
                  name: `🔊・${name}`,
                  type: ChannelType.GuildVoice,
                  parent: familyCategoryId,
                  permissionOverwrites: [
                      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                      { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                      { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
                  ]
              });
              voiceChannelId = voice.id;
          } catch (e) {
              logger.error({ err: e }, "Erro ao criar canais de família");
          }
      }

      const familyId = `fam_${Date.now()}`;
      families[familyId] = {
          id: familyId,
          name,
          ownerId: userId,
          members: [userId],
          textChannelId,
          voiceChannelId,
          roleId: role.id,
          createdAt: Date.now(),
          bank: 0,
          boughtSlots: 0,
          admins: []
      };

      await familyStore.save(families);
      return families[familyId];
  }

  async function deleteFamily(guild, userId) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      
      if (!family) throw new Error("Família não encontrada.");

      // Delete Discord Assets
      if (family.roleId) {
          const role = await guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.delete().catch(() => {});
      }
      if (family.textChannelId) {
          const ch = await guild.channels.fetch(family.textChannelId).catch(() => null);
          if (ch) await ch.delete().catch(() => {});
      }
      if (family.voiceChannelId) {
          const ch = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
          if (ch) await ch.delete().catch(() => {});
      }

      delete families[family.id];
      await familyStore.save(families);
      return true;
  }

  async function addMember(guild, familyId, targetMember, vipConfigService) {
      const families = await getAllFamilies();
      const family = families[familyId];
      if (!family) throw new Error("Família não encontrada.");

      if (family.members.includes(targetMember.id)) throw new Error("Membro já está na família.");

      // Check Limits
      const ownerMember = await guild.members.fetch(family.ownerId).catch(() => null);
      let limit = 3;
      if (ownerMember) {
          const tier = await vipConfigService.getMemberTier(ownerMember);
          limit = tier?.maxFamilyMembers ?? tier?.limits?.familyMembers ?? 3;
      }
      limit += (family.boughtSlots || 0);

      if (family.members.length >= limit) throw new Error(`Limite de membros atingido (${limit}).`);

      family.members.push(targetMember.id);
      await familyStore.save(families);

      if (family.roleId) {
          await targetMember.roles.add(family.roleId).catch(() => {});
      } else {
          // Manual perms
          if (family.textChannelId) {
               const ch = await guild.channels.fetch(family.textChannelId).catch(() => null);
               if (ch) await ch.permissionOverwrites.edit(targetMember.id, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.SendMessages]: true });
          }
          if (family.voiceChannelId) {
               const ch = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
               if (ch) await ch.permissionOverwrites.edit(targetMember.id, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.Connect]: true });
          }
      }
      return family;
  }

  async function removeMember(guild, familyId, targetId) {
      const families = await getAllFamilies();
      const family = families[familyId];
      if (!family) throw new Error("Família não encontrada.");

      family.members = family.members.filter(id => id !== targetId);
      if (family.admins) family.admins = family.admins.filter(id => id !== targetId);
      
      await familyStore.save(families);

      // Remove role/perms
      if (family.roleId) {
          const member = await guild.members.fetch(targetId).catch(() => null);
          if (member) await member.roles.remove(family.roleId).catch(() => {});
      } else {
          if (family.textChannelId) {
               const ch = await guild.channels.fetch(family.textChannelId).catch(() => null);
               if (ch) await ch.permissionOverwrites.delete(targetId).catch(() => {});
          }
          if (family.voiceChannelId) {
               const ch = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
               if (ch) await ch.permissionOverwrites.delete(targetId).catch(() => {});
          }
      }
      return family;
  }

  async function deposit(userId, amount, economyService) {
      const family = await getFamilyByMember(userId);
      if (!family) throw new Error("Você não tem família.");

      const balance = await economyService.getBalance(userId);
      if ((balance.coins || 0) < amount) throw new Error("Saldo insuficiente.");

      await economyService.removeCoins(userId, amount);
      
      // Reload to ensure freshness
      const families = await getAllFamilies();
      families[family.id].bank = (families[family.id].bank || 0) + amount;
      await familyStore.save(families);
      
      return families[family.id].bank;
  }

  async function withdraw(userId, amount, economyService) {
      const family = await getFamilyByMember(userId);
      if (!family) throw new Error("Você não tem família.");
      
      const isOwner = family.ownerId === userId;
      const isAdmin = family.admins && family.admins.includes(userId);
      if (!isOwner && !isAdmin) throw new Error("Apenas admins podem sacar.");

      const families = await getAllFamilies();
      const currentFamily = families[family.id];
      if (!currentFamily) throw new Error("Família não encontrada.");

      if ((currentFamily.bank || 0) < amount) throw new Error("Saldo insuficiente no banco.");

      currentFamily.bank -= amount;
      await familyStore.save(families);

      await economyService.addCoins(userId, amount);
      return currentFamily.bank;
  }

  async function upgradeSlots(userId) {
      const family = await getFamilyByMember(userId);
      if (!family) throw new Error("Você não tem família.");
      
      const isOwner = family.ownerId === userId;
      const isAdmin = family.admins && family.admins.includes(userId);
      if (!isOwner && !isAdmin) throw new Error("Apenas admins podem comprar upgrades.");

      const boughtSlots = family.boughtSlots || 0;
      const nextSlot = boughtSlots + 1;
      const cost = nextSlot * 5000;

      if ((family.bank || 0) < cost) throw new Error(`Saldo insuficiente. Custo: ${cost}`);

      const families = await getAllFamilies();
      families[family.id].bank -= cost;
      families[family.id].boughtSlots = nextSlot;
      await familyStore.save(families);

      return nextSlot;
  }

  async function renameFamily(guild, userId, newName) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode renomear.");

      family.name = newName;
      await familyStore.save(families);

      if (family.roleId) {
          const role = await guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.setName(`Família ${newName}`).catch(() => {});
      }
      if (family.textChannelId) {
          const ch = await guild.channels.fetch(family.textChannelId).catch(() => null);
          if (ch) await ch.setName(`🏰・${newName}`).catch(() => {});
      }
      if (family.voiceChannelId) {
          const ch = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
          if (ch) await ch.setName(`🔊・${newName}`).catch(() => {});
      }
      return family;
  }

  async function setFamilyColor(guild, userId, color) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode mudar a cor.");

      family.color = color;
      await familyStore.save(families);

      if (family.roleId) {
          const role = await guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.setColor(color).catch(() => {});
      }
      return family;
  }

  async function decorateChannels(guild, userId, template) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode decorar.");

      const newName = template.replace("{nome}", family.name);
      
      if (family.textChannelId) {
          const ch = await guild.channels.fetch(family.textChannelId).catch(() => null);
          if (ch) await ch.setName(newName.toLowerCase().replace(/\s+/g, '-')).catch(() => {});
      }
      if (family.voiceChannelId) {
          const ch = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
          if (ch) await ch.setName(newName).catch(() => {});
      }
  }

  async function promoteMember(userId, targetId) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode promover.");
      
      if (!family.members.includes(targetId)) throw new Error("Usuário não é membro.");
      if (targetId === userId) throw new Error("Você já é dono.");

      if (!family.admins) family.admins = [];
      if (family.admins.includes(targetId)) throw new Error("Já é admin.");

      family.admins.push(targetId);
      await familyStore.save(families);
  }

  async function resetAll(guild) {
      const families = await getAllFamilies();
      for (const fam of Object.values(families)) {
          try {
              if (!guild) continue;
              if (fam.roleId) {
                  const role = await guild.roles.fetch(fam.roleId).catch(() => null);
                  if (role) await role.delete().catch(() => {});
              }
              if (fam.textChannelId) {
                  const ch = await guild.channels.fetch(fam.textChannelId).catch(() => null);
                  if (ch) await ch.delete().catch(() => {});
              }
              if (fam.voiceChannelId) {
                  const ch = await guild.channels.fetch(fam.voiceChannelId).catch(() => null);
                  if (ch) await ch.delete().catch(() => {});
              }
          } catch {
              // ignore
          }
      }

      await familyStore.save({});
      return true;
  }

  async function demoteMember(userId, targetId) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode rebaixar.");

      if (!family.admins || !family.admins.includes(targetId)) throw new Error("Usuário não é admin.");

      family.admins = family.admins.filter(id => id !== targetId);
      await familyStore.save(families);
  }

  async function transferOwnership(userId, newOwnerId) {
      const families = await getAllFamilies();
      const family = Object.values(families).find(f => f.ownerId === userId);
      if (!family) throw new Error("Apenas o dono pode transferir.");

      if (!family.members.includes(newOwnerId)) throw new Error("Novo dono deve ser membro.");

      family.ownerId = newOwnerId;
      // Add old owner to admins maybe? Or just member.
      // Remove new owner from admins if they were one
      if (family.admins) family.admins = family.admins.filter(id => id !== newOwnerId);
      
      await familyStore.save(families);
  }

  return {
      getAllFamilies,
      getFamilyByOwner,
      getFamilyByMember,
      getFamilyById,
      createFamilyFull,
      deleteFamily,
      addMember,
      removeMember,
      deposit,
      withdraw,
      upgradeSlots,
      renameFamily,
      setFamilyColor,
      decorateChannels,
      promoteMember,
      demoteMember,
      transferOwnership,
      resetAll
  };
}

module.exports = { createFamilyService };
