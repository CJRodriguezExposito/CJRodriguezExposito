// Configuración
const LEAGUE_ID = 854;

// Variables globales
let standings = [];
let currentGW = 1;
let bootstrapData = null;
let sortConfig = { key: 'rank', direction: 'asc' };
let allMatches = {};
let teamStats = {};
let leagueName = '';

// Utilidad para hacer peticiones a la API
async function fetchAPI(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
    }
    return response.json();
}

// Inicialización de la app
async function init() {
    try {
        bootstrapData = await fetchAPI('https://fantasy.premierleague.com/api/bootstrap-static/');
        
        const leagueData = await fetchAPI('https://fantasy.premierleague.com/api/leagues-h2h/' + LEAGUE_ID + '/standings/');
        leagueName = leagueData.league.name || 'Liga ' + LEAGUE_ID;
        document.querySelector('h1 span:last-child').textContent = 'Fantasy PL - ' + leagueName;
        
        const current = bootstrapData.events.find(function(e) { return e.is_current; });
        if (current) {
            currentGW = current.id;
        }

        const gwSelect = document.getElementById('gw-select');
        for (let i = 1; i <= currentGW; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = 'Gameweek ' + i + (i === currentGW ? ' (Actual)' : '');
            if (i === currentGW) option.selected = true;
            gwSelect.appendChild(option);
        }

        await loadAllData();
        
        document.getElementById('loading').classList.add('hidden');
        showSection('standings');
    } catch (error) {
        console.error('Error inicializando:', error);
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error-message').classList.remove('hidden');
    }
}

// Cargar todos los datos de la liga
async function loadAllData() {
    const leagueData = await fetchAPI('https://fantasy.premierleague.com/api/leagues-h2h/' + LEAGUE_ID + '/standings/');
    const teamIds = leagueData.standings.results.map(function(t) { return t.entry; });

    // Cargar todos los partidos de todas las jornadas en paralelo
    const matchesPromises = [];
    for (let gw = 1; gw <= currentGW; gw++) {
        matchesPromises.push(
            fetchAPI('https://fantasy.premierleague.com/api/leagues-h2h-matches/league/' + LEAGUE_ID + '/?page=1&event=' + gw)
                .then(function(data) {
                    allMatches[gw] = data.results || [];
                    return data;
                })
        );
    }
    
    await Promise.all(matchesPromises);

    // Calcular estadísticas de cada equipo
    teamIds.forEach(function(teamId) {
        teamStats[teamId] = calculateTeamStats(teamId);
    });

    // Cargar información de los equipos
    const teamsPromises = teamIds.map(async function(teamId) {
        try {
            const teamData = await fetchAPI('https://fantasy.premierleague.com/api/entry/' + teamId + '/');
            const leagueTeam = leagueData.standings.results.find(function(t) { return t.entry === teamId; });
            const stats = teamStats[teamId];

            return {
                id: teamId,
                name: teamData.name,
                playerName: teamData.player_first_name + ' ' + teamData.player_last_name,
                rank: leagueTeam ? leagueTeam.rank : 0,
                h2hPoints: leagueTeam ? leagueTeam.total : 0,
                totalPoints: teamData.summary_overall_points,
                wins: stats.wins,
                draws: stats.draws,
                losses: stats.losses,
                closeWins: stats.closeWins,
                closeLosses: stats.closeLosses
            };
        } catch (error) {
            console.error('Error cargando equipo ' + teamId + ':', error);
            return null;
        }
    });

    standings = (await Promise.all(teamsPromises)).filter(function(t) { return t !== null; });
    renderStandings();
}

// Calcular estadísticas de un equipo
function calculateTeamStats(teamId) {
    let wins = 0, draws = 0, losses = 0, closeWins = 0, closeLosses = 0;
    
    for (let gw = 1; gw <= currentGW; gw++) {
        const gwMatches = allMatches[gw] || [];
        
        gwMatches.forEach(function(match) {
            let myScore = 0;
            let oppScore = 0;
            let isMyTeam = false;

            if (match.entry_1_entry === teamId) {
                myScore = match.entry_1_points;
                oppScore = match.entry_2_points;
                isMyTeam = true;
            } else if (match.entry_2_entry === teamId) {
                myScore = match.entry_2_points;
                oppScore = match.entry_1_points;
                isMyTeam = true;
            }

            if (isMyTeam) {
                const diff = myScore - oppScore;
                
                if (diff > 0) {
                    wins++;
                    if (diff <= 5) closeWins++;
                } else if (diff === 0) {
                    draws++;
                } else {
                    losses++;
                    if (Math.abs(diff) <= 5) closeLosses++;
                }
            }
        });
    }
    
    return { wins: wins, draws: draws, losses: losses, closeWins: closeWins, closeLosses: closeLosses };
}

// Renderizar tabla de clasificación
function renderStandings() {
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = '';

    const sorted = standings.slice().sort(function(a, b) {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (typeof aVal === 'string') {
            return sortConfig.direction === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }
        
        return sortConfig.direction === 'asc' 
            ? aVal - bVal
            : bVal - aVal;
    });

    sorted.forEach(function(team, idx) {
        const tr = document.createElement('tr');
        tr.className = 'team-row';
        tr.onclick = function() { showTeamDetails(team.id); };
        
        tr.innerHTML = 
            '<td><span class="' + (idx < 3 ? 'rank-gold' : '') + '">' + team.rank + '</span></td>' +
            '<td><div class="team-name">' + team.name + '</div><div class="player-name">' + team.playerName + '</div></td>' +
            '<td class="text-right"><strong>' + team.h2hPoints + '</strong></td>' +
            '<td class="text-right">' + team.totalPoints + '</td>' +
            '<td class="text-center" style="color: #10b981">' + team.wins + '</td>' +
            '<td class="text-center" style="color: #fbbf24">' + team.draws + '</td>' +
            '<td class="text-center" style="color: #ef4444">' + team.losses + '</td>' +
            '<td class="text-center">' + team.closeWins + '</td>' +
            '<td class="text-center">' + team.closeLosses + '</td>';
        
        tbody.appendChild(tr);
    });

    // Actualizar indicadores de ordenación
    document.querySelectorAll('th.sortable').forEach(function(th) {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    const sortedHeaders = document.querySelectorAll('th.sortable');
    sortedHeaders.forEach(function(th) {
        const onclickAttr = th.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(sortConfig.key)) {
            th.classList.add('sorted-' + sortConfig.direction);
        }
    });
}

// Ordenar tabla
function sortTable(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
    }
    renderStandings();
}

// Cargar partidos de una jornada
async function loadFixtures(gw) {
    const container = document.getElementById('fixtures-container');
    container.innerHTML = '<div class="loading">Cargando partidos...</div>';

    try {
        const gwMatches = allMatches[gw] || [];
        container.innerHTML = '';

        if (gwMatches.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px;">No hay partidos disponibles para esta jornada</p>';
            return;
        }

        gwMatches.forEach(function(fixture) {
            const team1 = standings.find(function(t) { return t.id === fixture.entry_1_entry; });
            const team2 = standings.find(function(t) { return t.id === fixture.entry_2_entry; });

            const diff = fixture.entry_1_points - fixture.entry_2_points;
            let resultClass = '';
            if (diff > 0) resultClass = 'win';
            else if (diff < 0) resultClass = 'loss';
            else resultClass = 'draw';

            const div = document.createElement('div');
            div.className = 'fixture ' + resultClass;
            div.innerHTML = 
                '<div style="text-align: right;">' +
                    '<div class="fixture-team">' + (team1 ? team1.name : 'Equipo 1') + '</div>' +
                    '<div class="player-name">' + (team1 ? team1.playerName : '') + '</div>' +
                '</div>' +
                '<div class="fixture-score">' +
                    fixture.entry_1_points + ' - ' + fixture.entry_2_points +
                '</div>' +
                '<div style="text-align: left;">' +
                    '<div class="fixture-team">' + (team2 ? team2.name : 'Equipo 2') + '</div>' +
                    '<div class="player-name">' + (team2 ? team2.playerName : '') + '</div>' +
                '</div>';
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error cargando partidos:', error);
        container.innerHTML = '<p class="error">Error cargando partidos</p>';
    }
}

// Mostrar detalles de un equipo
async function showTeamDetails(teamId) {
    showSection('team-details');
    
    const content = document.getElementById('team-details-content');
    content.innerHTML = '<div class="loading">Cargando detalles del equipo...</div>';

    try {
        const teamData = await fetchAPI('https://fantasy.premierleague.com/api/entry/' + teamId + '/');
        const historyData = await fetchAPI('https://fantasy.premierleague.com/api/entry/' + teamId + '/history/');

        // Obtener datos de capitanes
        const captainCounts = {};
        for (let gw = 1; gw <= currentGW; gw++) {
            try {
                const picksData = await fetchAPI('https://fantasy.premierleague.com/api/entry/' + teamId + '/event/' + gw + '/picks/');
                const captain = picksData.picks.find(function(p) { return p.is_captain; });
                
                if (captain && bootstrapData) {
                    const player = bootstrapData.elements.find(function(e) { return e.id === captain.element; });
                    if (player) {
                        captainCounts[player.web_name] = (captainCounts[player.web_name] || 0) + 1;
                    }
                }
            } catch (error) {
                console.error('Error obteniendo capitan GW ' + gw + ':', error);
            }
        }

        const stats = teamStats[teamId] || calculateTeamStats(teamId);

        // Obtener resultados H2H por jornada
        const h2hResults = [];
        for (let gw = 1; gw <= currentGW; gw++) {
            const gwMatches = allMatches[gw] || [];
            const myMatch = gwMatches.find(function(m) {
                return m.entry_1_entry === teamId || m.entry_2_entry === teamId;
            });

            if (myMatch) {
                const isTeam1 = myMatch.entry_1_entry === teamId;
                const myScore = isTeam1 ? myMatch.entry_1_points : myMatch.entry_2_points;
                const oppScore = isTeam1 ? myMatch.entry_2_points : myMatch.entry_1_points;
                const oppId = isTeam1 ? myMatch.entry_2_entry : myMatch.entry_1_entry;
                const opponent = standings.find(function(t) { return t.id === oppId; });

                let result = '';
                const diff = myScore - oppScore;
                if (diff > 0) result = 'Victoria';
                else if (diff < 0) result = 'Derrota';
                else result = 'Empate';

                h2hResults.push({
                    gw: gw,
                    myScore: myScore,
                    oppScore: oppScore,
                    opponent: opponent ? opponent.name : 'Desconocido',
                    result: result
                });
            }
        }

        const gwRows = historyData.current.slice(0, currentGW).map(function(gw, idx) {
            const ranking = gw.overall_rank ? gw.overall_rank.toLocaleString() : '-';
            const h2h = h2hResults[idx];
            const h2hInfo = h2h ? 
                '<div class="h2h-result">' + h2h.result + ' vs ' + h2h.opponent + ' (' + h2h.myScore + '-' + h2h.oppScore + ')</div>' : '';
            
            return '<tr>' +
                '<td>GW ' + gw.event + '</td>' +
                '<td class="text-right"><strong>' + gw.points + '</strong>' + h2hInfo + '</td>' +
                '<td class="text-right">' + gw.total_points + '</td>' +
                '<td class="text-right">' + ranking + '</td>' +
                '</tr>';
        }).join('');

        const captainItems = Object.entries(captainCounts)
            .sort(function(a, b) { return b[1] - a[1]; })
            .map(function(entry) {
                return '<div class="captain-item">' +
                    '<span>' + entry[0] + '</span>' +
                    '<span class="captain-badge">' + entry[1] + '</span>' +
                    '</div>';
            }).join('');

        content.innerHTML = 
            '<h2>' + teamData.name + '</h2>' +
            '<p style="font-size: 20px; opacity: 0.8; margin-bottom: 30px;">' +
                'Manager: ' + teamData.player_first_name + ' ' + teamData.player_last_name +
            '</p>' +
            '<div class="stats-grid">' +
                '<div class="stat-card" style="background: rgba(16, 185, 129, 0.3);">' +
                    '<div class="stat-value">' + stats.wins + '</div>' +
                    '<div class="stat-label">Victorias</div>' +
                '</div>' +
                '<div class="stat-card" style="background: rgba(251, 191, 36, 0.3);">' +
                    '<div class="stat-value">' + stats.draws + '</div>' +
                    '<div class="stat-label">Empates</div>' +
                '</div>' +
                '<div class="stat-card" style="background: rgba(239, 68, 68, 0.3);">' +
                    '<div class="stat-value">' + stats.losses + '</div>' +
                    '<div class="stat-label">Derrotas</div>' +
                '</div>' +
                '<div class="stat-card" style="background: rgba(59, 130, 246, 0.3);">' +
                    '<div class="stat-value">' + stats.closeWins + '</div>' +
                    '<div class="stat-label">Victorias ajustadas</div>' +
                '</div>' +
                '<div class="stat-card" style="background: rgba(249, 115, 22, 0.3);">' +
                    '<div class="stat-value">' + stats.closeLosses + '</div>' +
                    '<div class="stat-label">Derrotas ajustadas</div>' +
                '</div>' +
            '</div>' +
            '<h3>Resultados por Jornada</h3>' +
            '<div class="overflow-x">' +
                '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>GW</th>' +
                            '<th class="text-right">Puntos (H2H)</th>' +
                            '<th class="text-right">Puntos Totales</th>' +
                            '<th class="text-right">Ranking</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' + gwRows + '</tbody>' +
                '</table>' +
            '</div>' +
            '<h3>Capitanes Elegidos</h3>' +
            '<div class="captain-grid">' + captainItems + '</div>';
    } catch (error) {
        console.error('Error cargando detalles:', error);
        content.innerHTML = '<p class="error">Error cargando detalles del equipo</p>';
    }
}

// Cambiar sección visible
function showSection(section) {
    document.querySelectorAll('.section').forEach(function(s) {
        s.classList.remove('active');
    });
    document.querySelectorAll('.nav-buttons .btn').forEach(function(b) {
        b.classList.remove('active');
    });

    if (section === 'standings') {
        document.getElementById('standings-section').classList.add('active');
        document.querySelector('.nav-buttons .btn:first-child').classList.add('active');
    } else if (section === 'fixtures') {
        document.getElementById('fixtures-section').classList.add('active');
        document.querySelector('.nav-buttons .btn:last-child').classList.add('active');
        loadFixtures(currentGW);
    } else if (section === 'team-details') {
        document.getElementById('team-details-section').classList.add('active');
    }
}

// Iniciar la aplicación cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}