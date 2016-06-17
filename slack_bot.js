/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node slack_bot.js

# BUILT USING BOTKIT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
	console.log('Error: Specify token in environment');
	process.exit(1);
}

var Botkit = require('botkit');
var os = require('os');
var util = require('util');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var SQLite = require('sqlite3').verbose();
var db = new SQLite.Database('data/happyhour.db');

var controller = Botkit.slackbot({
	debug: true,
});

var bot = controller.spawn({
	token: process.env.token
}).startRTM();

function firstRunCheck(done) {
	db.get('SELECT value FROM info WHERE name = "firstrun" LIMIT 1', function (err, record) {
		if (err) {
			return console.error('DATABASE ERROR:', err);
		}

		var currentTime = (new Date()).toJSON();

		// updates with new last run time
		db.run('UPDATE info SET value = ? WHERE name = "lastrun"', currentTime);

		// this is a first run
		if (!record) {
			db.run('INSERT INTO info(name, value) VALUES("firstrun", ?)', currentTime);
			done(true);
		} else {
			done(false)
		}

	});
}

function welcomeMessage(bot, message) {
	bot.say({
		text: 'Hi there! I\'m Happy Hour! A slack bot built to help you coordinate drinks with friends.  Let\'s get started by setting up a few of your favorite watering holes for your to choose from!',
		channel: message.channel
	})
	addBar(bot, message);
}

function addBar(bot, message) {
	var bar = {};
	askName = function (response, convo) {
		convo.ask('What is the name of your bar?', function (response, convo) {
			convo.say('I love that place!');
			bar.name = response.text;
			askLocation(response, convo);
			convo.next();
		});
	}
	askLocation = function (response, convo) {
		bar.location = response.text;
		convo.ask('Where is ' + bar.location + ' located? (street address, city, state, zip please)', function (response, convo) {
			convo.say('Thanks!')
			askConfirm(response, convo);
			convo.next();
		});
	}
	askConfirm = function (response, convo) {
		bar.address = response.text
		convo.ask('I\'ve got ' + bar.name + ' on ' + bar.address + '.  Is that correct?', [
			{
				pattern: bot.utterances.yes,
				callback: function (response, convo) {
					convo.say('Great! Let me get a few more details...');
					askWebsite(response, convo);
					convo.next();

				}
      },
			{
				pattern: bot.utterances.no,
				callback: function (response, convo) {
					convo.say('Let\'s start over then.');
					bar = {};
					askName(response, convo);
					convo.next();
				}
      },
			{
				default: true,
				callback: function (response, convo) {
					convo.repeat();
					convo.next();
				}
      }
    ]);
	}

	askWebsite = function (response, convo) {
		convo.ask('If they have a website, enter it now.  If not, simply say no.', [
			{
				pattern: bot.utterances.no,
				callback: function (response, convo) {
					convo.say('Awesome. Almost done...');
					bar.website = '';
					askEnd(response, convo);
					convo.next();
				}
      },
			{
				pattern: '<([^ \\|>]*)(?:[^>])*>',
				callback: function (response, convo) {
					convo.say('Thanks, that\'s really helpful!');
					bar.website = response.text.match(/<([^ \|>]*)(?:[^>])*>/)[1]
					askEnd(response, convo);
					convo.next();
				}
			},
			{
				default: true,
				callback: function (response, convo) {
					// just repeat the question
					convo.repeat();
					convo.next();
				}
      }
		])
	}

	askEnd = function (response, convo) {
		convo.ask('I\'ve got ' + bar.name + ' located at ' + bar.address + '.  For more information, people can visit ' + bar.website + '. Is this correct?', [
			{
				pattern: bot.utterances.yes,
				callback: function (response, convo) {
					convo.say('Saving...');
					var id = crypto.randomBytes(6).toString('hex');
					db.run('INSERT INTO bars(id, name, address, website) VALUES(?, ?, ?, ?)', [id, bar.name, bar.address, bar.website], function (err, done) {
						if (err) {
							convo.say('There was an error saving the bar. ERROR: ' + err);
							convo.ask('Would you like me to try again?', [])
							convo.next();
						} else {
							convo.say('Success! Type `@happyhour help` to see what else I can do for you.')
							convo.next();
						}
					})

				}
      },
			{
				pattern: bot.utterances.no,
				callback: function (response, convo) {
					convo.say('Dang.');
					askName(repsonse, convo);
					convo.next();
				}
      },
			{
				default: true,
				callback: function (response, convo) {
					// just repeat the question
					convo.repeat();
					convo.next();
				}
      }
			])
	}
	bot.startConversation(message, askName);
}

/*controller.on('hello', function(bot, mesage) {
		var bot = bot
		var message = message
		firstRunCheck(function (firstRun) {
			if (firstRun) {
				welcomeMessage(bot, message)
			}
		})
})*/

function setUpHappyHour(bot, message) {
	var happyhour = {}
	var barOptions = ''
	var barsArray = []
	db.all('SELECT * FROM bars', function (err, bars) {
		if (err) {
			return console.error('DATABASE ERROR:', err);
		}
		console.log(bars);
		for (var i = 1; i - 1 < bars.length; i++) {
			barsArray.push(bars[i - 1]);
			barOptions += '\n' + i + ': `' + bars[i - 1].name + '` | Address: `' + bars[i - 1].address + '`'
		}
		bot.startConversation(message, askBar);
	})

	askBar = function (response, convo) {
		convo.ask('Let\'s get our drink on! Choose the number of the bar you\'d like to go to?' + barOptions, [
			{
				pattern: '(\\d?\\d)',
				callback: function (response, convo) {
					convo.say('Drinks at ' + barsArray[Number(response.text) - 1].name + ' sounds great!');
					happyhour.location = barsArray[Number(response.text) - 1].name
					happyhour.locationID = barsArray[Number(response.text) - 1].id
					askTime(response, convo);
					convo.next();
				}
			},
			{
				default: true,
				callback: function (response, convo) {
					convo.say('I\'m sorry, your repsonse doesnt look like a number from the list.')
					convo.repeat();
					convo.next();
				}
      }
		]);
	}

	askTime = function (response, convo) {
		convo.ask('What time were you thinking?', function (response, convo) {
			convo.say('Drinks at ' + happyhour.location + ' at ' + response.text + ' sounds perfect!');
			happyhour.time = response.text
			askTimeConfirm(response, convo);
			convo.next();
		})
	}

	askTimeConfirm = function (response, convo) {
		convo.ask('Confirm? (Yes/No)', [
			{
				pattern: bot.utterances.yes,
				callback: function (response, convo) {
					convo.say('Great! I\'ve got drinks at ' + happyhour.location + ' at ' + happyhour.time + ' setup.  I\'ll let others know!');
					convo.next();
					/*var id = crypto.randomBytes(6).toString('hex');
					db.run('INSERT INTO bars(id, name, address, website) VALUES(?, ?, ?, ?)', [id, bar.name, bar.address, bar.website], function (err, done) {
						if (err) {
							convo.say('There was an error saving the bar. ERROR: ' + err);
							convo.ask('Would you like me to try again?', [])
							convo.next();
						} else {
							convo.say('Success! Type `@happyhour help` to see what else I can do for you.')
							convo.next();
						}
					})*/

				}
      },
			{
				pattern: bot.utterances.no,
				callback: function (response, convo) {
					convo.say('Dang.');
					askBar(repsonse, convo);
					convo.next();
				}
      },
			{
				default: true,
				callback: function (response, convo) {
					// just repeat the question
					convo.repeat();
					convo.next();
				}
      }
			])
	}
}

controller.hears(['drinks', 'drink', 'happy hour', 'happyhour', 'booze'], 'direct_message,direct_mention,mention', function (bot, message) {
	setUpHappyHour(bot, message);
})

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function (bot, message) {
	var bot = bot;
	bot.api.reactions.add({
		timestamp: message.ts,
		channel: message.channel,
		name: 'robot_face',
	}, function (err, res) {
		if (err) {
			bot.botkit.log('Failed to add emoji reaction :(', err);
		}
	});


	controller.storage.users.get(message.user, function (err, user) {
		if (user && user.name) {
			bot.reply(message, 'Hello ' + user.name + '!!');
		} else {
			bot.reply(message, 'Hello.');
		}
	});

	firstRunCheck(function (firstRun) {
		if (firstRun) {
			welcomeMessage(bot, message)
		}
	});
});

controller.hears(['help', 'halp', 'help me', 'halp me', 'help please', 'halp please', 'please help', 'please halp'], 'direct_message,direct_mention,mention', function (bot, message) {

})

controller.hears(['add bar', 'add new bar', 'add new place', 'add new watering hole', 'add place', 'add watering hole'], 'direct_message,direct_mention,mention', function (bot, message) {
	addBar(bot, message);
})

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function (bot, message) {
	var name = message.match[1];
	controller.storage.users.get(message.user, function (err, user) {
		if (!user) {
			user = {
				id: message.user,
			};
		}
		user.name = name;
		controller.storage.users.save(user, function (err, id) {
			bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
		});
	});
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function (bot, message) {

	controller.storage.users.get(message.user, function (err, user) {
		if (user && user.name) {
			bot.reply(message, 'Your name is ' + user.name);
		} else {
			bot.startConversation(message, function (err, convo) {
				if (!err) {
					convo.say('I do not know your name yet!');
					convo.ask('What should I call you?', function (response, convo) {
						convo.ask('You want me to call you `' + response.text + '`?', [
							{
								pattern: 'yes',
								callback: function (response, convo) {
									// since no further messages are queued after this,
									// the conversation will end naturally with status == 'completed'
									convo.next();
								}
                            },
							{
								pattern: 'no',
								callback: function (response, convo) {
									// stop the conversation. this will cause it to end with status == 'stopped'
									convo.stop();
								}
                            },
							{
								default: true,
								callback: function (response, convo) {
									convo.repeat();
									convo.next();
								}
                            }
                        ]);

						convo.next();

					}, {
						'key': 'nickname'
					}); // store the results in a field called nickname

					convo.on('end', function (convo) {
						if (convo.status == 'completed') {
							bot.reply(message, 'OK! I will update my dossier...');

							controller.storage.users.get(message.user, function (err, user) {
								if (!user) {
									user = {
										id: message.user,
									};
								}
								user.name = convo.extractResponse('nickname');
								controller.storage.users.save(user, function (err, id) {
									bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
								});
							});



						} else {
							// this happens if the conversation ended prematurely for some reason
							bot.reply(message, 'OK, nevermind!');
						}
					});
				}
			});
		}
	});
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function (bot, message) {

	bot.startConversation(message, function (err, convo) {

		convo.ask('Are you sure you want me to shutdown?', [
			{
				pattern: bot.utterances.yes,
				callback: function (response, convo) {
					convo.say('Bye!');
					convo.next();
					setTimeout(function () {
						process.exit();
					}, 3000);
				}
            },
			{
				pattern: bot.utterances.no,
				default: true,
				callback: function (response, convo) {
					convo.say('*Phew!*');
					convo.next();
				}
        }
        ]);
	});
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
	'direct_message,direct_mention,mention',
	function (bot, message) {

		var hostname = os.hostname();
		var uptime = formatUptime(process.uptime());

		bot.reply(message,
			':robot_face: I am a bot named <@' + bot.identity.name +
			'>. I have been running for ' + uptime + ' on ' + hostname + '.');

	});

function formatUptime(uptime) {
	var unit = 'second';
	if (uptime > 60) {
		uptime = uptime / 60;
		unit = 'minute';
	}
	if (uptime > 60) {
		uptime = uptime / 60;
		unit = 'hour';
	}
	if (uptime != 1) {
		unit = unit + 's';
	}

	uptime = uptime + ' ' + unit;
	return uptime;
}