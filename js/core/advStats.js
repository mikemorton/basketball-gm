/**
 * @name core.advStats
 * @namespace Advanced stats (PER, WS, etc) that require some nontrivial calculations and thus are calculated and cached once each day.
 */
define(["db"], function (db) {
    "use strict";

    /**
     * Calcualte the current season's Player Efficiency Rating (PER) for each active player and write it to the database.
     *
     * This is based on http://www.basketball-reference.com/about/per.html
     *
     * @memberOf core.advStats
     */
    function calculatePER(cb) {
        // Total team stats (not per game averages) - gp, pts, ast, fg, plus all the others needed for league totals
        var attributes, stats;

        attributes = ["tid"];
        stats = ["gp", "ft", "pf", "ast", "fg", "pts", "fga", "orb", "tov", "fta", "trb", "oppPts"];
        db.getTeams(null, g.season, attributes, stats, [], {totals: true}, function (teams) {
            var i, league, leagueStats;

            // Total league stats (not per game averages) - gp, ft, pf, ast, fg, pts, fga, orb, tov, fta, trb
            leagueStats = ["gp", "ft", "pf", "ast", "fg", "pts", "fga", "orb", "tov", "fta", "trb"];
            league = _.reduce(teams, function (memo, team) {
                var i;
                for (i = 0; i < leagueStats.length; i++) {
                    if (memo.hasOwnProperty(leagueStats[i])) {
                        memo[leagueStats[i]] = memo[leagueStats[i]] + team[leagueStats[i]];
                    } else {
                        memo[leagueStats[i]] = team[leagueStats[i]];
                    }
                }
                return memo;
            }, {});

            // Calculate pace for each team, using the "estimated pace adjustment" formula rather than the "pace adjustment" formula because it's simpler and ends up at nearly the same result. To do this the real way, I'd probably have to store the number of possessions from core.gameSim.
            for (i = 0; i < teams.length; i++) {
                //estimated pace adjustment = 2 * lg_PPG / (team_PPG + opp_PPG)
                teams[i].pace = 2 * (league.pts / league.gp) / (teams[i].pts / teams[i].gp + teams[i].oppPts / teams[i].gp);
            }

            // Total player stats (not per game averages) - min, tp, ast, fg, ft, tov, fga, fta, trb, orb, stl, blk, pf
            g.dbl.transaction("players").objectStore("players").getAll().onsuccess = function (event) {
                var aPER, attributes, drbp, factor, i, PER, players, ratings, stats, tid, uPER, vop;
                attributes = ["pid", "tid"];
                ratings = [];
                stats = ["min", "tp", "ast", "fg", "ft", "tov", "fga", "fta", "trb", "orb", "stl", "blk", "pf"];

                players = db.getPlayers(event.target.result, g.season, null, attributes, stats, ratings, {totals: true});

                aPER = [];
                league.aPER = 0;
                for (i = 0; i < players.length; i++) {
                    tid = players[i].tid;

                    factor = (2 / 3) - (0.5 * (league.ast / league.fg)) / (2 * (league.fg / league.ft));
                    vop = league.pts / (league.fga - league.orb + league.tov + 0.44 * league.fta);
                    drbp = (league.trb - league.orb) / league.trb;  // DRB%

                    if (players[i].stats.min > 0) {
                        uPER = (1 / players[i].stats.min) *
                               (players[i].stats.tp
                               + (2 / 3) * players[i].stats.ast
                               + (2 - factor * (teams[tid].ast / teams[tid].fg)) * players[i].stats.fg
                               + (players[i].stats.ft * 0.5 * (1 + (1 - (teams[tid].ast / teams[tid].fg)) + (2 / 3) * (teams[tid].ast / teams[tid].fg)))
                               - vop * players[i].stats.tov
                               - vop * drbp * (players[i].stats.fga - players[i].stats.fg)
                               - vop * 0.44 * (0.44 + (0.56 * drbp)) * (players[i].stats.fta - players[i].stats.ft)
                               + vop * (1 - drbp) * (players[i].stats.trb - players[i].stats.orb)
                               + vop * drbp * players[i].stats.orb
                               + vop * players[i].stats.stl
                               + vop * drbp * players[i].stats.blk
                               - players[i].stats.pf * ((league.ft / league.pf) - 0.44 * (league.fta / league.pf) * vop));
                    } else {
                        uPER = 0;
                    }

                    aPER[i] = teams[tid].pace * uPER;
                    league.aPER = league.aPER + aPER[i] * players[i].stats.min;
                }

                league.aPER = league.aPER / (league.gp * 5 * 48);

                PER = _.map(aPER, function (num) { return num * (15 / league.aPER); });

                // Save to database
                g.dbl.transaction("players", "readwrite").objectStore("players").openCursor().onsuccess = function (event) {
                    var cursor, i, p;

                    cursor = event.target.result;
                    if (cursor) {
                        p = cursor.value;

                        for (i = 0; i < players.length; i++) {
                            if (players[i].pid === p.pid) {
                                _.last(p.stats).per = PER[i];
                                break;
                            }
                        }

                        cursor.update(p);

                        cursor.continue();
                    } else {
                        if (cb !== undefined) {
                            cb();
                        }
                    }
                }
            };
        });
    }

    function calculateAll(cb) {
        calculatePER(cb);
    }

    return {
        calculateAll: calculateAll
    };
});