class PolyGlot {

    constructor() {
        this.known_languages = new Set();
        this.refresh_timeout = null;
        }

    static async getLanguages() {
        switch (game.system.id) {
            case "dnd5e":
            case "dnd5eJP":
            case "pf1":
            case "pf2e":
            case "ose":
                return CONFIG[game.system.id.toUpperCase()].languages;
                break;
            case "wfrp4e":
                const pack = game.packs.get("wfrp4e.skills");
                const itemList = await pack.getIndex();
                const langs = {};
                for (let item of itemList) {
                    const match = item.name.match(/Language \((.+)\)/i);
                    if (match)
                        langs[match[1]] = match[1];
                }
                return langs;
                break;
            default:
                return [];
        }
    }
    static get languages() {
        return this._languages || {};
    }
    static set languages(val) {
        this._languages = val || {};
    }
    static get defaultLanguage() {
        const defaultLang = game.settings.get("polyglot", "defaultLanguage");
        if (defaultLang) {
            if (this.languages[defaultLang]) return defaultLang;
            const inverted = invertObject(this.languages);
            if (inverted[defaultLang]) return inverted[defaultLang];
        }
        if (game.system.id === "wfrp4e") return "Reikspiel";
        if (Object.keys(this.languages).includes("common")) return "common";
        return this.languages[0] || "";
    }

    renderChatLog(chatlog, html, data) {
        const lang_html = $(`
        <div id="polyglot"  class="polyglot-lang-select flexrow">
                <label>Language : </label>
                <select name="polyglot-language">
                </select>
        </div>
        `);
        html.find("#chat-controls").after(lang_html);
        const select = html.find(".polyglot-lang-select select");
        select.change(e => {
            this.lastSelection = select.val();
        })
        this.updateUserLanguages(html)
    }

    updateUser(user, data) {
        if (user.id == game.user.id && data.character !== undefined) {
            this.updateUserLanguages(ui.chat.element)
            this.updateChatMessages()
        }
    }

    controlToken() {
        this.updateUserLanguages(ui.chat.element)
        this.updateChatMessages()
    }

    updateChatMessages() {
        // Delay refresh because switching tokens could cause a controlToken(false) then controlToken(true) very fast
        if (this.refresh_timeout)
            clearTimeout(this.refresh_timeout)
        this.refresh_timeout = setTimeout(this.updateChatMessagesDelayed.bind(this), 500)
    }

    updateChatMessagesDelayed() {
        this.refresh_timeout = null;
        // Get the last 100 messages
        const messages = ui.chat.element.find('.message').slice(-100).toArray().map(m => game.messages.get(m.dataset.messageId))
        // Loop in reverse so most recent messages get refreshed first.
        for (let i = messages.length - 1; i >= 0; i--) {
            let message = messages[i]
            if (message.data.type == CONST.CHAT_MESSAGE_TYPES.IC) {
                let lang = message.data.flags.polyglot.language || ""
                let unknown = !this.known_languages.has(lang);
                if (game.user.isGM && !game.settings.get("polyglot", "runifyGM")) {
                    // Update globe color
                    const globe = ui.chat.element.find(`.message[data-message-id="${message.id}"] .message-metadata .polyglot-message-language i`)
                    const color = unknown ? "red" : "green";
                    globe.css({color});
                    unknown = false;
                }
                if (unknown != message.polyglot_unknown)
                    ui.chat.updateMessage(message)
            }
        }
    }

    updateUserLanguages(html) {
        let actors = [];
        this.known_languages = new Set();
        for (let token of canvas.tokens.controlled) {
            if (token.actor)
                actors.push(token.actor)
        }
        if (actors.length == 0 && game.user.character)
            actors.push(game.user.character);
        for (let actor of actors) {
            try {
                switch (game.system.id) {
                    case "wfrp4e":
                        for (let item of actor.data.items) {
                            const match = item.name.match(/Language \((.+)\)/i);
                            // adding only the descriptive language name, not "Language (XYZ)"
                            if (match)
                                this.known_languages.add(match[1]);
                        }
                        break;
                    case "ose":
                        for (let lang of actor.data.data.languages.value)
                            this.known_languages.add(lang)
                        break;
                    default:
                        // Don't duplicate the value in case it's a not an array
                        for (let lang of actor.data.data.traits.languages.value)
                            this.known_languages.add(lang)
                        break;
                }
            } catch (err) {
                // Maybe not dnd5e, pf1 or pf2e or corrupted actor data?
            }
        }
        if (this.known_languages.size == 0) {
            if (game.user.isGM)
                this.known_languages = new Set(Object.keys(PolyGlot.languages))
            else
                this.known_languages.add(PolyGlot.defaultLanguage);
        }
        let options = ""
        for (let lang of this.known_languages) {
            let label = PolyGlot.languages[lang] || lang
            options += `<option value="${lang}">${label}</option>`
        }
        const select = html.find(".polyglot-lang-select select");
        const prevOption = select.val();
        select.html($(options));
        let selectedLanguage = this.lastSelection || prevOption || PolyGlot.defaultLanguage;
        // known_languages is a Set, so it's weird to access its values
        if (!this.known_languages.has(selectedLanguage))
            selectedLanguage = PolyGlot.defaultLanguage;
        if (!this.known_languages.has(selectedLanguage))
            selectedLanguage = [...this.known_languages][0];
        select.val(selectedLanguage);
    }

    generateRune(string,salt) {
        var hash = 0;
        salt = string+salt;
        for (var i = 0; i < salt.length; i++) {
            var char = salt.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        var randomgen = new MersenneTwister(hash);
        function randomize() {
            var char = Math.floor(randomgen.random()*62+48);
            if (char>57) char+=7;
            if (char>90) char+=6;
            return String.fromCharCode(char)
        }
        return string.replace(/[^a-zA-Z0-9-_ ]/g, '').replace('  ',' ').replace(/[\S]/gu,randomize)
    }

    renderChatMessage(message, html, data) {
        // html and data are swapped on 0.3.x in relation to other render<Application> hooks
        if (message.data.type == CONST.CHAT_MESSAGE_TYPES.IC) {
            let lang = message.data.flags.polyglot.language || ""
            if (lang != "") {
                let metadata = html.find(".message-metadata")
                let language = PolyGlot.languages[lang] || lang
                const unknown = !this.known_languages.has(lang);
                message.polyglot_unknown = unknown;
                if (game.user.isGM && !game.settings.get("polyglot", "runifyGM"))
                    message.polyglot_unknown = false;
                if (!message.polyglot_force && message.polyglot_unknown) {
                    let content = html.find(".message-content")
                    let new_content = this.generateRune(message.data.content,game.settings.get('polyglot','salt') === true ? message.data._id : lang)
                    content.text(new_content)
                    content[0].style = this.tongues[lang] === undefined ? 'font:' + this.alphabets[this.tongues._default] : 'font:' + this.alphabets[this.tongues[lang]]
                    message.polyglot_unknown = true;
                }
                else { html.find(".message-content")[0].style = '' }
                const color = unknown ? "red" : "green";
                metadata.find(".polyglot-message-language").remove()
                const title = game.user.isGM || !unknown ? `title="${language}"` : ""
                let button = $(`<a class="button polyglot-message-language" ${title}>
                    <i class="fas fa-globe" style="color:${color}"></i>
                </a>`)
                metadata.append(button)
                if (game.user.isGM) {
                    button.click(this._onGlobeClick.bind(this))
                }
            }
        }
    }

    _onGlobeClick(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents('.message');
        const message = Messages.instance.get(li.data("messageId"));
        message.polyglot_force = !message.polyglot_force;
        ui.chat.updateMessage(message)
    }

    preCreateChatMessage(data, options, userId) {
        if (data.type == CONST.CHAT_MESSAGE_TYPES.IC) {
            let lang = ui.chat.element.find("select[name=polyglot-language]").val()
            if (lang != "")
                mergeObject(data, { "flags.polyglot.language": lang });
        }
    }

    setup() {
        switch (game.system.id) {
            case "dnd5e":
                this.alphabets = {common:'130% Thorass',celestial:'180% Celestial',outwordly:'200% ArCiela',draconic:'170% Iokharic',dwarvish:'120% Dethek',druidic:'100% AngloSax',gnoll:'150% Kargi',elvish:'150% Espruar',infernal:'230% Infernal',tirsu:'250% Pulsian',drowic:'150% HighDrowic'}
                this.tongues = {_default:'common',abyssal:'infernal',aquan:'dwarvish',auran:'dwarvish',celestial:'celestial',deep:'outwordly',draconic:'draconic',druidic:'druidic',dwarvish:'dwarvish',elvish:'elvish',giant:'dwarvish',gith:'tirsu',gnoll:'gnoll',gnomish:'dwarvish',goblin:'dwarvish',ignan:'dwarvish',infernal:'infernal',orc:'dwarvish',primordial:'dwarvish',sylvan:'elvish',terran:'dwarvish',undercommon:'drowic'}
                break;
            case "pf1":
            case "pf2e":
                this.alphabets = {common:'130% Thorass',abyssal:'150% Barazhad',auran:'100% OldeThorass',azlanti:'120% Tengwar',boggard:'120% Semphari',celestial:'180% Celestial',outwordly:'200% ArCiela',draconic:'170% Iokharic',dwarvish:'120% Dethek',drowic:'150% HighDrowic',druidic:'100% AngloSax',dziriak:'250% Pulsian',giant:'120% MeroiticDemotic',gnoll:'150% Kargi',elvish:'150% Espruar',erutaki:'120% Tuzluca',garundi:'120% Qijomi',infernal:'230% Infernal',jistka:'120% Valmaric',jungle:'120% JungleSlang',kelish:'170% HighschoolRunes',oriental:'120% Oriental',requian:'150% Reanaarian',serpent:'120% Ophidian',signs:'170% FingerAlphabet',sylvan:'150% OldeEspruar',thassilonian:'150% Thassilonian',utopian:'140% MarasEye'}
                this.tongues = {_default:'common',aboleth:'outwordly',abyssal:'abyssal',aklo:'serpent',algollthu:'outwordly',anadi:'jungle',aquan:'auran',arboreal:'sylvan',auran:'auran',azlanti:"azlanti",boggard:"boggard",caligni:"drowic",celestial:"celestial",cyclops:"giant",daemonic:"infernal",dark:"drowic",destrachan:"outwordly",draconic:"draconic",drowsign:"signs",druidic:"druidic",dwarven:"dwarvish",dziriak:"dziriak",elven:"elvish",erutaki:"erutaki",garundi:"garundi",giant:"giant",gnoll:"gnoll",gnome:"dwarvish",gnomish:"dwarvish",goblin:"gnoll",grippli:"boggard",hallit:"azlanti",ignan:"dwarvish",iruxi: "boggard",jistkan:"jistka",jotun: "giant",jyoti:"celestial",infernal:"infernal",kelish:"kelish",mwangi:"azlanti",necril:"drowic",orc:"dwarvish",orcish:"dwarvish",polyglot:"azlanti",protean:"abyssal",requian:"requian",shoanti:"azlanti",skald:"jitska",sphinx:"requian",strix:"infernal",sylvan:"sylvan",shoony:"dwarvish",taldane:'azlanti',tengu:"oriental",terran:"dwarvish",thassilonian:"thassilonian",tien:"oriental",treant:"sylvan",undercommon:"drowic",utopian:"utopian",varisian:"azlanti",vegepygmy:"gnoll",vudrani:"garundi"}
                break;
            case "ose":
                this.alphabets = {common:'130% Thorass',lawful:'180% Celestial',chaotic:'150% Barazhad',neutral:'230% Infernal',doppelganger:'250% Pulsian',dwarvish:'120% Dethek',draconic:'170% Iokharic',gargoyle:'150% HighDrowic',gnoll:'150% Kargi',gnomish:'120% Tengwar',harpy:'100% OldeThorass',elvish:'150% Espruar',ogre:'120% MeroiticDemotic',sylvan:'150% OldeEspruar'}
                this.tongues = {_default:'common',1:'lawful',2:'chaotic',3:'neutral',4:'dwarvish',5:'doppelganger',6:'draconic',7:'dwarvish',8:'elvish',9:'gargoyle',10:'gnoll',11:'gnomish',12:'dwarvish',14:'harpy',15:'dwarvish',16:'draconic',17:'draconic',18:'gargoyle',19:'sylvan',20:'ogre',21:'dwarvish',22:'sylvan'}
                break;
            case "wfrp4e":
            default:
                this.alphabets = {common:'120% Dethek'}
                this.tongues = {_default:'common'}
            }
        // custom languages
        game.settings.register("polyglot", "customLanguages", {
            name: "Custom Languages",
            hint: "Define a list of custom, comma separated, languages to add to the system.",
            scope: "world",
            config: true,
            default: "",
            type: String,
            onChange: (value) => this.setCustomLanguages(value)
        });
        game.settings.register("polyglot", "defaultLanguage", {
            name: "Default Language",
            hint: "Name of the default language to select. Keep empty to use system default.",
            scope: "client",
            config: true,
            default: "",
            type: String
        });
        game.settings.register("polyglot", "runifyGM", {
            name: "Scramble for GM",
            hint: "Disable this option to always show the text for the GM (refer to the globe's color for the token's understanding).",
            scope: "client",
            config: true,
            default: true,
            type: Boolean,
            onChange: () => this.updateChatMessages()
        });
        game.settings.register("polyglot", "salt", {
            name: "Unique Texts",
            hint: "Enable this option to make every single text look different.",
            scope: "world",
            config: true,
            default: false,
            type: Boolean
        });
    }

    ready() {
        this.setCustomLanguages(game.settings.get("polyglot", "customLanguages"));
    }

    async setCustomLanguages(languages) {
        PolyGlot.languages = await PolyGlot.getLanguages();
        for (let lang of languages.split(",")) {
            lang = lang.trim();
            const key = lang.toLowerCase().replace(/ \'/g, "_");
            PolyGlot.languages[key] = lang;
        }
        this.updateUserLanguages(ui.chat.element);
    }

    _addPolyglotEditor(sheet) {
        if (sheet._polyglotEditor) return;
        sheet._polyglot_original_createEditor = sheet._createEditor;
        const languages = Object.entries(PolyGlot.languages).map(([lang, name]) => {
            return {
              title: name,
              inline: 'span',
              classes: 'polyglot-journal',
              attributes: {
                  title: name,
                  "data-language": lang
              }
            };
        });
        sheet._createEditor = function(target, editorOptions, initialContent) {
            editorOptions.style_formats = [
              {
                title: "Custom",
                items: [
                  {
                    title: "Secret",
                    block: 'section',
                    classes: 'secret',
                    wrapper: true
                  }
                ]
              },
              {
                title: "Polyglot",
                items: languages
              }
            ];
            editorOptions.formats = {
                removeformat: [
                    // Default remove format configuration from tinyMCE
                    {
                      selector: 'b,strong,em,i,font,u,strike,sub,sup,dfn,code,samp,kbd,var,cite,mark,q,del,ins',
                      remove: 'all',
                      split: true,
                      expand: false,
                      block_expand: true,
                      deep: true
                    },
                    {
                      selector: 'span',
                      attributes: [
                        'style',
                        'class'
                      ],
                      remove: 'empty',
                      split: true,
                      expand: false,
                      deep: true
                    },
                    {
                      selector: '*',
                      attributes: [
                        'style',
                        'class'
                      ],
                      split: false,
                      expand: false,
                      deep: true
                    },
                    // Add custom config to remove spans from polyglot when needed
                    {
                        selector: 'span',
                        classes: 'polyglot-journal',
                        attributes: ['title', 'class', 'data-language'],
                        remove: 'all',
                        split: true,
                        expand: false,
                        deep: true
                    },
                ]
            };
            this._polyglot_original_createEditor(target, editorOptions, initialContent);
        }
        sheet._polyglotEditor = true;
    }

    renderJournalSheet(journalSheet,html) {
        this._addPolyglotEditor(journalSheet);
        if (journalSheet.entity.owner || game.user.isGM) {
            let runes = false;
            let texts = [];
            let openBtn = $(`<a class="polyglot-button" title="Toggle Runes"><i class="fas fa-unlink"></i> Runes</a>`);
            openBtn.click(ev => {
                let button = html.closest('.app').find('.polyglot-button')[0].firstChild
                runes = !runes
                button.className = runes === false ? 'fas fa-unlink' : 'fas fa-link';
                if (runes) {
                    const spans = journalSheet.element.find("span.polyglot-journal");
                    for (let span of spans.toArray()) {
                        const lang = span.dataset.language;
                        if (!lang) continue;
                        texts.push(span.textContent)
                        span.textContent = this.generateRune(span.textContent,game.settings.get('polyglot','salt') === true ? journalSheet._id : lang)
                        span.style = this.tongues[lang] === undefined ? 'font:' + this.alphabets[this.tongues._default] : 'font:' + this.alphabets[this.tongues[lang]]
                    }
                }
                else {
                    const spans = journalSheet.element.find("span.polyglot-journal");
                    var i = 0;
                    for (let span of spans.toArray()) {
                        const lang = span.dataset.language;
                        if (!lang) continue;
                        span.textContent = texts[i]
                        span.style = ''
                        i++;
                    }
                }
            });
            html.closest('.app').find('.polyglot-button').remove();
            let titleElement = html.closest('.app').find('.window-title');
            openBtn.insertAfter(titleElement);
            return;
        }
        const spans = journalSheet.element.find("span.polyglot-journal");
        for (let span of spans.toArray()) {
            const lang = span.dataset.language;
            if (!lang) continue;
            if (!this.known_languages.has(lang)) {
                span.title = "????"
                span.textContent = this.generateRune(span.textContent,game.settings.get('polyglot','salt') === true ? journalSheet._id : lang)
                span.style = this.tongues[lang] === undefined ? 'font:' + this.alphabets[this.tongues._default] : 'font:' + this.alphabets[this.tongues[lang]]
            }
        }
    }
    chatBubble (token, html, message, {emote}) {
        message = game.messages._source[game.messages._source.length-1];
        if (message.type == CONST.CHAT_MESSAGE_TYPES.IC) {
            let lang = message.flags.polyglot.language || ""
            if (lang != "") {
                const unknown = !this.known_languages.has(lang);
                message.polyglot_unknown = unknown;
                if (game.user.isGM && !game.settings.get("polyglot", "runifyGM"))
                    message.polyglot_unknown = false;
                if (!message.polyglot_force && message.polyglot_unknown) {
                    let content = html.find(".bubble-content")
                    let new_content = this.generateRune(message.content,game.settings.get('polyglot','salt') === true ? message._id : lang)
                    content.text(new_content)
                    content[0].style = this.tongues[lang] === undefined ? 'font:' + this.alphabets[this.tongues._default] : 'font:' + this.alphabets[this.tongues[lang]]
                    message.polyglot_unknown = true;
                }
            }
        }
    }
    /*  _setPosition(token, html, dimensions) {
    let cls = Math.random() > 0.5 ? "left" : "right";
    html.addClass(cls);
    const pos = {
      height: dimensions.height,
      width: dimensions.width,
      top: token.y - dimensions.height - 8
    };
    if ( cls === "right" ) pos.left = token.x - (dimensions.width - token.w);
    else pos.left = token.x;
    html.css(pos);
  }*/
}

PolyGlotSingleton = new PolyGlot()

Hooks.on('renderChatLog', PolyGlotSingleton.renderChatLog.bind(PolyGlotSingleton))
Hooks.on('updateUser', PolyGlotSingleton.updateUser.bind(PolyGlotSingleton))
Hooks.on('controlToken', PolyGlotSingleton.controlToken.bind(PolyGlotSingleton))
Hooks.on('preCreateChatMessage', PolyGlotSingleton.preCreateChatMessage.bind(PolyGlotSingleton))
Hooks.on('renderChatMessage', PolyGlotSingleton.renderChatMessage.bind(PolyGlotSingleton))
Hooks.on('renderJournalSheet', PolyGlotSingleton.renderJournalSheet.bind(PolyGlotSingleton))
Hooks.on('setup', PolyGlotSingleton.setup.bind(PolyGlotSingleton))
Hooks.on('ready', PolyGlotSingleton.ready.bind(PolyGlotSingleton))
Hooks.on("chatBubble", PolyGlotSingleton.chatBubble.bind(PolyGlotSingleton)) //token, html, message, {emote}