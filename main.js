var SinaOAuth = require('./lib/sinaOAuth');
var mysql     = require('mysql');
var http      = require('http');

var xml2js = require('xml2js');

var robot_uid      = 2416956217;
var robot_name     = 'DictMan';
var access_key     = '04d227bebc8b27c2f43f5769cf657ec4';
var access_secret  = '18e401e4681081e097f2fa2c8f1e0bb5';

var sina_api = new SinaOAuth(access_key, access_secret);

var mysql_client = mysql.createClient(
    {
        user     : 'dict',
        password : 'robot',
        database : 'dictrobot',
        host     : 'f1.vzhishu.com',
    }
);

var repost_queue = [];

var save_status = function(status) {
    var retweet_id = 0;
    if (status.retweeted_status) {
        retweet_id = status.retweeted_status.id;
    }

    var reply_id = 0;
    if (status.in_reply_to_status_id) {
        reply_id = status.in_reply_to_status_id;
    }

    //console.log(status);
    mysql_client.query(
        'INSERT INTO mentions(id, uid, retweet_id, reply_id, data_str)'
            + 'VALUES(?, ?, ?, ?, ?)',
        [status.id, status.user.id, retweet_id, reply_id, JSON.stringify(status)], 
        function(err, info) {
            console.log(err);
            console.log(info);
        }
    );
};

//https://ajax.googleapis.com/ajax/services/language/translate?key=AIzaSyDeGDd1tp9GYXYb6lsElmtbHhZAjUksII4&v=1.0&q=交通很差&langpair=zh%7Cen

var process_trans_xml = function(username, word, data, status) {
    var parser = new xml2js.Parser();
    parser.parseString(data, 
                       function(err, result) {
                           //console.log(err);
                           console.log(result);

                           var message = '';
                           if (result.sugg) {
                               message = '@' + username + ' ' + word + ' 未找到，你是不是要找 ';
                               for (var i in result.sugg) {
                                   if (i > 3) {
                                       break;
                                   }
                                   message += result.sugg[i] + ' ';
                               }
                           } else {
                               if (!result.key) {
                                   message = '@' + username + ' ' + word + ' 未找到';
                               } else {
                                   message = '@' + username + ' ' + result.key;
                                   message += ' [' + result.pron + '] : ';
                                   var def = result.def.split('\n')[0]
                                   message += def;
                                   console.log(message);
                               }
                           }

                           repost_queue.push(
                               function() {
                                   var args = {
                                       status     : message,
                                       id         : status.id,
                                       is_comment : 2,
                                   };

                                   sina_api.repost(args,
                                                   function(err, newdata) {
                                                       if (err) {
                                                           console.log(err);
                                                       } else {
                                                           console.log('SAVE TO MYSWL')
                                                           save_status(status);
                                                       }
                                                   });
                                   
                               });
                       });
};

var process_status = function(status) {
    var text     = status.text;
    var username = status.user.name;
    console.log(text);
    console.log(username)

    var parts = text.split('@' + robot_name);
    var found = false;
    var word  = '';
    for (var p_idx in parts) {
        var words = parts[p_idx].split(' ');
        for (var w_idx in words) {
            word = words[w_idx];
            if (word.length > 0) {
                found = true;
            }
        }
    }
    
    if (found) {
        //do query
        //http://dict.cn/ws.php?utf8=true&q=
        var opts = {
            host : 'dict.cn',
            path : '/ws.php?utf8=true&q=' + word,
            method : 'GET',
        };
        console.log('Ready to request dict.cn');
        var req = http.request(opts, 
                               function(res) {
                                   res.setEncoding('utf8');
                                   res.on('data', function(data) {
                                              process_trans_xml(username, word, data, status)
                                          });
                               });
                                    
        req.end();
    }
}

var fetch_mentions = function(since_id) {
    var args = {
        since_id : since_id,
    };
    sina_api.mentions(args,
                      function(err, data) {
                          if (err) {
                              console.log(err);
                          } else {
                              data = JSON.parse(data);
                              for (var i = 0; i < data.length; i++) {
                                  var status = data[i];
                                  var nid = status.id;
                                  var uid = status.user.id;
                                  if (uid == robot_uid) {
                                      continue;
                                  }
                                  
                                  process_status(status);
                              }
                              //console.log(data);
                          }
                      });
}


var send_repost_message = function() {
    //console.log('repost_queue length : ' + repost_queue.length)
    if (repost_queue.length > 0) {
        var func = repost_queue.pop()
        func();
        
    }
}

var query_new_mentions = function() {
    //getting last processed id
    mysql_client.query(
        'SELECT id FROM mentions ORDER BY id DESC LIMIT 1',
        function(err, results, fields) {
            var since_id = 0
            if (results.length > 0) {
                since_id = results[0].id;
            }
            //console.log('SINCE_ID ' + since_id);
            fetch_mentions(since_id);
            //mysql_client.end();
        }
    );
};

setInterval(send_repost_message, 5 * 1000);
setInterval(query_new_mentions, 5 * 1000);



