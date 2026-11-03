-- refx_whitelist: gate connections behind Discord roles, checked by ReFx Assistant.
--
-- On playerConnecting we defer, read the player's discord: identifier and ask
-- the bot's whitelist API (GET <url>/whitelist/<discordId>, Bearer key). The bot
-- answers from its member cache, so the bot token never lives on this server.
-- Which roles count is set on the dashboard's FiveM City page.
--
-- server.cfg (use `set`, never `setr`, so the key is not sent to clients):
--   set refx_whitelist_url "http://BOT_HOST:30125"
--   set refx_whitelist_key "same value as FIVEM_API_KEY in the bot's .env"
--   set refx_whitelist_failopen "false"     # let players in if the bot is unreachable
--   set refx_whitelist_recheck_minutes "5"  # drop players who lose the role (0 = off)
--   ensure refx_whitelist

local URL = GetConvar('refx_whitelist_url', '')
local KEY = GetConvar('refx_whitelist_key', '')
local FAIL_OPEN = GetConvar('refx_whitelist_failopen', 'false') == 'true'
local RECHECK_MINUTES = tonumber(GetConvar('refx_whitelist_recheck_minutes', '5')) or 0
local TIMEOUT_MS = 8000

local NO_DISCORD = 'ReFx Roleplay needs your Discord account. Open the Discord desktop app, '
	.. 'restart FiveM and connect again.'
local UNREACHABLE = 'We could not check your whitelist right now. Please try again in a minute.'

local function log(message, ...)
	print(('^5[refx_whitelist]^7 ' .. message):format(...))
end

local function discordId(source)
	for _, identifier in ipairs(GetPlayerIdentifiers(source)) do
		if identifier:sub(1, 8) == 'discord:' then
			return identifier:sub(9)
		end
	end
	return nil
end

-- Calls back with (ok, body). ok is false when the bot can't be reached or
-- answers with something we can't read.
local function ask(id, cb)
	local done = false
	PerformHttpRequest(('%s/whitelist/%s'):format(URL:gsub('/+$', ''), id), function(status, body)
		if done then return end
		done = true
		if status ~= 200 or not body then
			return cb(false, ('HTTP %s'):format(tostring(status)))
		end
		local okDecode, data = pcall(json.decode, body)
		if not okDecode or type(data) ~= 'table' then
			return cb(false, 'bad response')
		end
		cb(true, data)
	end, 'GET', '', { ['Authorization'] = 'Bearer ' .. KEY, ['Accept'] = 'application/json' })
	-- PerformHttpRequest has no timeout of its own.
	SetTimeout(TIMEOUT_MS, function()
		if done then return end
		done = true
		cb(false, 'timeout')
	end)
end

if URL == '' or KEY == '' then
	log('^1refx_whitelist_url / refx_whitelist_key are not set: the whitelist is OFF.^7')
	return
end

AddEventHandler('playerConnecting', function(name, _, deferrals)
	local src = source
	deferrals.defer()
	Wait(0)
	deferrals.update('Checking your ReFx whitelist...')

	local id = discordId(src)
	if not id then
		log('%s refused: no Discord identifier', name)
		return deferrals.done(NO_DISCORD)
	end

	ask(id, function(ok, data)
		if not ok then
			log('lookup for %s (%s) failed: %s', name, id, tostring(data))
			if FAIL_OPEN then return deferrals.done() end
			return deferrals.done(UNREACHABLE)
		end
		if data.allowed then
			return deferrals.done()
		end
		log('%s (%s) refused: %s', name, id, tostring(data.reason))
		deferrals.done(data.message or 'You are not whitelisted for ReFx Roleplay.')
	end)
end)

-- Periodically re-check everyone online so losing the role (or leaving the
-- Discord) takes effect without waiting for a reconnect. Never drops anyone
-- when the bot is unreachable.
if RECHECK_MINUTES > 0 then
	CreateThread(function()
		while true do
			Wait(RECHECK_MINUTES * 60000)
			for _, player in ipairs(GetPlayers()) do
				local src = tonumber(player)
				local id = discordId(src)
				if id then
					ask(id, function(ok, data)
						if ok and not data.allowed and data.reason ~= 'whitelist_disabled' then
							log('dropping %s (%s): %s', GetPlayerName(src) or '?', id, tostring(data.reason))
							DropPlayer(src, data.message or 'You are no longer whitelisted for ReFx Roleplay.')
						end
					end)
					Wait(250)
				end
			end
		end
	end)
end

log('whitelist on, asking %s (fail %s)', URL, FAIL_OPEN and 'open' or 'closed')
