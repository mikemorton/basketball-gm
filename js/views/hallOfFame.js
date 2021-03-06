/**
 * @name views.hallOfFame
 * @namespace Hall of fame table.
 */
define(["globals", "ui", "core/player", "lib/jquery", "lib/knockout", "lib/underscore", "util/bbgmView", "util/helpers", "util/viewHelpers"], function (g, ui, player, $, ko, _, bbgmView, helpers, viewHelpers) {
    "use strict";

    var mapping;

    function get(req) {
        return {
            season: helpers.validateSeason(req.params.season)
        };
    }

    function InitViewModel() {
        this.season = ko.observable();
    }

    mapping = {
        players: {
            create: function (options) {
                return options.data;
            }
        }
    };

    function updatePlayers(inputs, updateEvents, vm) {
        var deferred, playersAll;

        if (updateEvents.indexOf("dbChange") >= 0 || updateEvents.indexOf("firstRun") >= 0 || (updateEvents.indexOf("newPhase") >= 0 && g.phase === g.PHASE.BEFORE_DRAFT)) {
            deferred = $.Deferred();

            playersAll = [];

            g.dbl.transaction("players").objectStore("players").index("tid").openCursor(g.PLAYER.RETIRED).onsuccess = function (event) {
                var cursor, i, j, p, players;

                cursor = event.target.result;
                if (cursor) {
                    p = cursor.value;
                    if (p.hof) {
                        playersAll.push(p);
                    }
                    cursor.continue();
                } else {
                    players = player.filter(playersAll, {
                        attrs: ["pid", "name", "pos", "draft", "retiredYear", "statsTids"],
                        ratings: ["ovr"],
                        stats: ["season", "abbrev", "gp", "min", "trb", "ast", "pts", "per"]
                    });

                    // This stuff isn't in player.filter because it's only used here.
                    for (i = 0; i < players.length; i++) {
                        players[i].peakOvr = 0;
                        for (j = 0; j < players[i].ratings.length; j++) {
                            if (players[i].ratings[j].ovr > players[i].peakOvr) {
                                players[i].peakOvr = players[i].ratings[j].ovr;
                            }
                        }

                        players[i].bestStats = {
                            gp: 0,
                            min: 0,
                            per: 0
                        };
                        for (j = 0; j < players[i].stats.length; j++) {
                            if (players[i].stats[j].gp * players[i].stats[j].min * players[i].stats[j].per > players[i].bestStats.gp * players[i].bestStats.min * players[i].bestStats.per) {
                                players[i].bestStats = players[i].stats[j];
                            }
                        }
                    }

                    deferred.resolve({
                        players: players
                    });
                }
            };
            return deferred.promise();
        }
    }

    function uiFirst(vm) {
        ui.title("Hall of Fame");

        ko.computed(function () {
            ui.datatable($("#hall-of-fame"), 2, _.map(vm.players(), function (p) {
                return ['<a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a>', p.pos, String(p.draft.year), String(p.retiredYear), String(p.peakOvr), String(p.bestStats.season),  '<a href="' + helpers.leagueUrl(["roster", p.bestStats.abbrev, p.bestStats.season]) + '">' + p.bestStats.abbrev + '</a>', String(p.bestStats.gp), helpers.round(p.bestStats.min, 1), helpers.round(p.bestStats.pts, 1), helpers.round(p.bestStats.trb, 1), helpers.round(p.bestStats.ast, 1), helpers.round(p.bestStats.per, 1), String(p.careerStats.gp), helpers.round(p.careerStats.min, 1), helpers.round(p.careerStats.pts, 1), helpers.round(p.careerStats.trb, 1), helpers.round(p.careerStats.ast, 1), helpers.round(p.careerStats.per, 1), p.statsTids.indexOf(g.userTid) >= 0];
            }), {
                fnRowCallback: function (nRow, aData) {
                    // Highlight players from the user's team
                    if (aData[aData.length - 1]) {
                        nRow.classList.add("alert-info");
                    }
                }
            });
        }).extend({throttle: 1});
    }

    return bbgmView.init({
        id: "hallOfFame",
        get: get,
        InitViewModel: InitViewModel,
        mapping: mapping,
        runBefore: [updatePlayers],
        uiFirst: uiFirst
    });
});