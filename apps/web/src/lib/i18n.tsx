/* oxlint-disable react/only-export-components -- locale constants and hooks belong with their provider */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const locales = ["en", "hi", "gu"] as const;
export type UiLocale = (typeof locales)[number];
export const localeNames: Record<UiLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};

type Variables = Record<string, string | number>;
type Dictionary = Record<string, string>;

const hi = {
  "Your events": "आपके कार्यक्रम",
  "Event workspace": "कार्यक्रम कार्यक्षेत्र",
  "Stage console": "मंच कंसोल",
  "Event setup": "कार्यक्रम सेटअप",
  "Speakers & facts": "वक्ता और तथ्य",
  "Host scripts": "संचालक स्क्रिप्ट्स",
  Announcements: "घोषणाएँ",
  "Revision history": "संशोधन इतिहास",
  "Event settings": "कार्यक्रम सेटिंग्स",
  "Anchor view": "एंकर दृश्य",
  "Anchor runbook": "एंकर रनबुक",
  "Help & guide": "सहायता और मार्गदर्शिका",
  Help: "सहायता",
  "Sign out": "साइन आउट",
  "Signing out…": "साइन आउट हो रहा है…",
  "Your workspace": "आपका कार्यक्षेत्र",
  Workspace: "कार्यक्षेत्र",
  "Anonymous session": "अनाम सत्र",
  "Skip to content": "मुख्य सामग्री पर जाएँ",
  "Stage workspace": "मंच कार्यक्षेत्र",
  "One stage. One shared plan.": "एक मंच। एक साझा योजना।",
  "Main navigation": "मुख्य नेविगेशन",
  "Human-led. Stage-ready.": "मानव-नेतृत्व। मंच के लिए तैयार।",
  "Single-stage event control": "एकल-मंच कार्यक्रम नियंत्रण",
  "Open navigation": "नेविगेशन खोलें",
  "Interface language": "इंटरफ़ेस भाषा",
  "Navigate your event.": "अपने कार्यक्रम में जाएँ।",
  "Mobile navigation": "मोबाइल नेविगेशन",
  "Sign out of CuePilot?": "CuePilot से साइन आउट करें?",
  "This is an anonymous session. Signing out loses access to events owned by this identity. There is no account recovery in this build.":
    "यह एक अनाम सत्र है। साइन आउट करने पर इस पहचान के कार्यक्रमों की पहुँच चली जाएगी। इस संस्करण में खाता पुनर्प्राप्ति उपलब्ध नहीं है।",
  "Local event shortcuts and offline snapshots will be cleared. Server data remains until you delete the event or its 72-hour expiry.":
    "स्थानीय कार्यक्रम शॉर्टकट और ऑफ़लाइन स्नैपशॉट मिटा दिए जाएँगे। सर्वर डेटा कार्यक्रम हटाने या 72 घंटे की अवधि पूरी होने तक रहेगा।",
  "Keep working": "काम जारी रखें",
  "Could not sign out. Try again.": "साइन आउट नहीं हो सका। फिर प्रयास करें।",
  "Connect your workspace.": "अपना कार्यक्षेत्र जोड़ें।",
  "Firebase and API configuration are required before your event data can load.":
    "आपके कार्यक्रम का डेटा लोड होने से पहले Firebase और API कॉन्फ़िगरेशन आवश्यक है।",
  "Missing public configuration": "सार्वजनिक कॉन्फ़िगरेशन उपलब्ध नहीं है",
  "Copy apps/web/.env.example to apps/web/.env.local, enter your project values, then restart Vite.":
    "apps/web/.env.example को apps/web/.env.local में कॉपी करें, अपने प्रोजेक्ट के मान भरें, फिर Vite पुनः शुरू करें।",
  "Enable Firebase anonymous authentication and authorize this domain. Server secrets do not belong in frontend configuration.":
    "Firebase अनाम प्रमाणीकरण सक्षम करें और इस डोमेन को अधिकृत करें। सर्वर सीक्रेट फ्रंटएंड कॉन्फ़िगरेशन में नहीं होने चाहिए।",
  "Check configuration again": "कॉन्फ़िगरेशन फिर जाँचें",
  "Restoring your secure session": "आपका सुरक्षित सत्र पुनर्स्थापित हो रहा है",
  "You’re signed out.": "आपने साइन आउट कर दिया है।",
  "Your stage awaits.": "आपका मंच तैयार है।",
  "Local event shortcuts and offline snapshots have been cleared.":
    "स्थानीय कार्यक्रम शॉर्टकट और ऑफ़लाइन स्नैपशॉट साफ़ कर दिए गए हैं।",
  "Continue with an anonymous browser identity to create or join an event.":
    "कार्यक्रम बनाने या उसमें शामिल होने के लिए अनाम ब्राउज़र पहचान के साथ आगे बढ़ें।",
  "Retry sign-in": "फिर से साइन इन करें",
  "Start a new session": "नया सत्र शुरू करें",
  "Anonymous sessions cannot be recovered after sign-out. No email or password is required.":
    "साइन आउट के बाद अनाम सत्र पुनर्प्राप्त नहीं किए जा सकते। ईमेल या पासवर्ड आवश्यक नहीं है।",
  "Your session is active": "आपका सत्र सक्रिय है",
  "You’re using an anonymous browser identity. Use Sign out in navigation to leave this workspace.":
    "आप अनाम ब्राउज़र पहचान का उपयोग कर रहे हैं। यह कार्यक्षेत्र छोड़ने के लिए नेविगेशन में साइन आउट चुनें।",
  "Go to your events": "अपने कार्यक्रमों पर जाएँ",
  "We couldn’t find that page.": "हमें वह पेज नहीं मिला।",
  "The link may be incomplete. Return to your workspace or open an invitation from your organizer.":
    "लिंक अधूरा हो सकता है। अपने कार्यक्षेत्र पर लौटें या आयोजक का निमंत्रण खोलें।",
  "Opening page": "पेज खुल रहा है",
  "Loading your workspace": "आपका कार्यक्षेत्र लोड हो रहा है",
  "This view isn’t available": "यह दृश्य उपलब्ध नहीं है",
  "Try again": "फिर प्रयास करें",
  "Close dialog": "संवाद बंद करें",
  "Retry original request": "मूल अनुरोध फिर चलाएँ",
  "The application could not display this page. Reload to recover your session.":
    "एप्लिकेशन यह पेज नहीं दिखा सका। अपना सत्र पुनः प्राप्त करने के लिए रीलोड करें।",
  Live: "लाइव",
  Syncing: "सिंक हो रहा है",
  "Updates paused": "अपडेट रुके हैं",
  revision: "संशोधन",
  "Offline snapshot · revision {revision} · last synced {time}. Updates paused.":
    "ऑफ़लाइन स्नैपशॉट · संशोधन {revision} · अंतिम सिंक {time}। अपडेट रुके हैं।",
  never: "कभी नहीं",
  "Any countdown shown is an estimate from cached timing, not live coordination.":
    "दिखाई गई उलटी गिनती कैश किए समय का अनुमान है, लाइव समन्वय नहीं।",
  "Upcoming cue reminder": "आगामी संकेत अनुस्मारक",
  "{cue} starts in {minutes} {unit}.": "{cue} {minutes} {unit} में शुरू होगा।",
  minute: "मिनट",
  minutes: "मिनट",
  "Check that {speaker} is ready.": "जाँचें कि {speaker} तैयार हैं।",
  "Check that your host is ready.": "जाँचें कि आपका संचालक तैयार है।",
  "This is a timing reminder; shared readiness responses are not available yet.":
    "यह समय अनुस्मारक है; साझा तैयारी प्रतिक्रियाएँ अभी उपलब्ध नहीं हैं।",
  "Review recovery options": "रिकवरी विकल्प देखें",
  "If they are not ready, tell the organizer before the cue starts.":
    "यदि वे तैयार नहीं हैं, तो संकेत शुरू होने से पहले आयोजक को बताएँ।",
  "Dismiss on this screen": "इस स्क्रीन पर हटाएँ",
  "Live stage overview": "लाइव मंच अवलोकन",
  "ON STAGE": "मंच पर",
  "Event host": "कार्यक्रम संचालक",
  "Stage standby": "मंच प्रतीक्षा",
  Pronunciation: "उच्चारण",
  "Assigned to the current cue": "वर्तमान संकेत के लिए नियुक्त",
  "No speaker assigned": "कोई वक्ता नियुक्त नहीं",
  "CURRENT ACTIVITY": "वर्तमान गतिविधि",
  ACTIVE: "सक्रिय",
  COMPLETE: "पूर्ण",
  STANDBY: "प्रतीक्षा",
  "That’s a wrap.": "कार्यक्रम समाप्त हुआ।",
  "Ready when you are.": "आपके तैयार होते ही हम तैयार हैं।",
  "Between cues": "संकेतों के बीच",
  "{start}–{end} IST · actual start / forecast end":
    "{start}–{end} IST · वास्तविक शुरुआत / अनुमानित अंत",
  "Review and publish your agenda to begin.":
    "शुरू करने के लिए अपनी कार्यसूची देखें और प्रकाशित करें।",
  "Waiting for the next cue.": "अगले संकेत की प्रतीक्षा है।",
  "Planned window:": "नियोजित समय:",
  "UP NEXT": "अगला",
  "Nothing further scheduled": "आगे कुछ निर्धारित नहीं है",
  "PAST FORECAST END": "अनुमानित अंत पार",
  "TIME REMAINING": "शेष समय",
  "Scenario clock · advances manually":
    "परिदृश्य घड़ी · मैन्युअल रूप से आगे बढ़ती है",
  "Offline estimate · updates paused": "ऑफ़लाइन अनुमान · अपडेट रुके हैं",
  "Synced to the server clock": "सर्वर घड़ी से सिंक",
  "Projected finish": "अनुमानित समाप्ति",
  "Hard finish": "अनिवार्य समाप्ति",
  "Repair preview": "रिकवरी पूर्वावलोकन",
  Feasible: "संभव",
  "No feasible plan": "कोई संभव योजना नहीं",
  Recovered: "पुनर्प्राप्त",
  "(restored time)": "(समय वापस मिला)",
  "Weighted shortening cost": "भारित संक्षिप्तीकरण लागत",
  "Recovery comparison": "रिकवरी तुलना",
  "Original and proposed intervals for pending cues":
    "लंबित संकेतों के मूल और प्रस्तावित समयांतराल",
  Cue: "संकेत",
  Now: "अभी",
  Proposed: "प्रस्तावित",
  Minutes: "मिनट",
  unchanged: "अपरिवर्तित",
  "Hard-rule checks": "अनिवार्य नियम जाँच",
  pass: "पास",
  fail: "विफल",
  "Minimum durations respected": "न्यूनतम अवधि सुरक्षित",
  "Fixed start protected": "निश्चित शुरुआत सुरक्षित",
  "Hard finish protected": "अनिवार्य समाप्ति सुरक्षित",
  "Buffer before cue respected": "संकेत से पहले का अंतर सुरक्षित",
  "Speaker release time respected": "वक्ता उपलब्धता समय सुरक्षित",
  "No overlapping cues": "संकेत आपस में नहीं टकराते",
  "Plan covers every pending cue": "योजना हर लंबित संकेत को शामिल करती है",
  "Completed cues untouched": "पूर्ण संकेत अपरिवर्तित",
  "Active cue untouched": "सक्रिय संकेत अपरिवर्तित",
  "Whole minutes only": "केवल पूर्ण मिनट",
  "This preview expires at {time} (ten real minutes). The published plan has not changed.":
    "यह पूर्वावलोकन {time} पर समाप्त होगा (दस वास्तविक मिनट)। प्रकाशित योजना नहीं बदली है।",
  "Publishing…": "प्रकाशित हो रहा है…",
  "Approve and publish": "स्वीकृत करके प्रकाशित करें",
  "Discard preview": "पूर्वावलोकन हटाएँ",
  "This preview has expired. Discard it and calculate a new plan.":
    "यह पूर्वावलोकन समाप्त हो गया है। इसे हटाकर नई योजना बनाएँ।",
  "Publishing is disabled because no plan satisfies every rule. CuePilot will not relax a rule on its own.":
    "प्रकाशन बंद है क्योंकि कोई योजना हर नियम पूरा नहीं करती। CuePilot स्वयं कोई नियम ढीला नहीं करेगा।",
  "Review draft": "ड्राफ्ट की समीक्षा करें",
  "AI draft": "AI ड्राफ्ट",
  Template: "टेम्पलेट",
  "Schema checked": "स्कीमा जाँचा गया",
  missing: "अनुपलब्ध",
  "Referenced facts found ({count})": "संदर्भित तथ्य मिले ({count})",
  pending: "लंबित",
  "Human review": "मानवीय समीक्षा",
  edited: "संपादित",
  unedited: "असंपादित",
  "Warnings from validation": "सत्यापन चेतावनियाँ",
  "Draft copy (edit before approving if needed)":
    "ड्राफ्ट प्रति (ज़रूरत हो तो स्वीकृति से पहले संपादित करें)",
  "{count}/1500 characters": "{count}/1500 अक्षर",
  "— too long to approve": "— स्वीकृति के लिए बहुत लंबा",
  "Source facts the model was given": "मॉडल को दिए गए स्रोत तथ्य",
  used: "उपयोग किया",
  unused: "उपयोग नहीं किया",
  "server record": "सर्वर रिकॉर्ड",
  "This draft references a fact that is not in the snapshot. Do not approve it.":
    "यह ड्राफ्ट ऐसे तथ्य का संदर्भ देता है जो स्नैपशॉट में नहीं है। इसे स्वीकृत न करें।",
  "A valid schema and resolvable fact references do not prove the copy is faithful to the facts. Read the draft against the sources before approving.":
    "मान्य स्कीमा और उपलब्ध तथ्य संदर्भ यह साबित नहीं करते कि प्रति तथ्यों के प्रति सही है। स्वीकृति से पहले स्रोतों से मिलान करें।",
  "I reviewed the words against the approved facts and checked the language.":
    "मैंने स्वीकृत तथ्यों से शब्दों का मिलान किया और भाषा जाँची।",
  "This draft has expired. Discard it and generate a new one.":
    "यह ड्राफ्ट समाप्त हो गया है। इसे हटाकर नया बनाएँ।",
  "Approving…": "स्वीकृत हो रहा है…",
  "Approve and publish copy": "प्रति स्वीकृत करके प्रकाशित करें",
  "Discard draft": "ड्राफ्ट हटाएँ",
  "A little preparation. A calmer stage.": "थोड़ी तैयारी। अधिक शांत मंच।",
  "Your guide to operating an event with CuePilot.":
    "CuePilot के साथ कार्यक्रम चलाने की आपकी मार्गदर्शिका।",
  "From your first cue to your final applause":
    "पहले संकेत से अंतिम तालियों तक",
  "Set up your event": "अपना कार्यक्रम सेट करें",
  "Choose rehearsal for a clock you control, or live for the actual server clock. Add up to 20 cues, speakers, pronunciation hints, and approved facts.":
    "अपने नियंत्रण वाली घड़ी के लिए रिहर्सल, या वास्तविक सर्वर घड़ी के लिए लाइव चुनें। अधिकतम 20 संकेत, वक्ता, उच्चारण संकेत और स्वीकृत तथ्य जोड़ें।",
  "Protect what matters": "ज़रूरी चीज़ों को सुरक्षित रखें",
  "Give cues preferred and minimum durations. Set fixed starts, speaker availability, buffers, and a hard finish. Save the draft, then validate and publish from the console.":
    "संकेतों के पसंदीदा और न्यूनतम समय तय करें। निश्चित शुरुआत, वक्ता उपलब्धता, अंतराल और अनिवार्य समाप्ति सेट करें। ड्राफ्ट सहेजें, फिर कंसोल से जाँचकर प्रकाशित करें।",
  "Bring your anchor in": "अपने संचालक को जोड़ें",
  "Create a single-use invitation and share it privately. Your anchor opens it in a separate browser profile. They receive the published runbook and acknowledge each revision.":
    "एक बार उपयोग होने वाला निमंत्रण बनाएँ और निजी रूप से साझा करें। आपका संचालक इसे अलग ब्राउज़र प्रोफ़ाइल में खोलता है। उन्हें प्रकाशित रनबुक मिलती है और वे हर संशोधन की पुष्टि करते हैं।",
  "Respond to a delay": "देरी का समाधान करें",
  "Start cues in order. Report extra minutes or a later speaker release time. Preview the recovery, review the rule checks, and approve. An impossible plan stays unpublished.":
    "संकेत क्रम से शुरू करें। अतिरिक्त मिनट या वक्ता की देर से उपलब्धता दर्ज करें। रिकवरी का पूर्वावलोकन करें, नियम जाँचें और स्वीकृत करें। असंभव योजना अप्रकाशित रहती है।",
  "Keep a record": "रिकॉर्ड सुरक्षित रखें",
  "Revision history preserves every published change. Print the anchor runbook as a dated reference. Old revisions are read-only.":
    "संशोधन इतिहास हर प्रकाशित बदलाव सुरक्षित रखता है। दिनांकित संदर्भ के रूप में संचालक रनबुक प्रिंट करें। पुराने संशोधन केवल पढ़ने योग्य हैं।",
  "What works in this build": "इस बिल्ड में क्या काम करता है",
  "Event drafts, deterministic schedule repair, publication, cue controls, rehearsal clocks, invitations, acknowledgments, revision history, deletion, and cached published runbooks are connected to the backend.":
    "कार्यक्रम ड्राफ्ट, निश्चित शेड्यूल रिकवरी, प्रकाशन, संकेत नियंत्रण, रिहर्सल घड़ी, निमंत्रण, पुष्टि, संशोधन इतिहास, हटाना और कैश की गई प्रकाशित रनबुक बैकएंड से जुड़े हैं।",
  "Script generation uses approved facts and requires your review before publication. If AI is unavailable, the backend returns a clearly labelled template. Announcements publish the exact words you enter and can be dismissed in a new revision.":
    "स्क्रिप्ट निर्माण स्वीकृत तथ्यों का उपयोग करता है और प्रकाशन से पहले आपकी समीक्षा माँगता है। AI उपलब्ध न होने पर बैकएंड स्पष्ट लेबल वाला टेम्पलेट देता है। घोषणाएँ आपके दर्ज किए गए सटीक शब्द प्रकाशित करती हैं और नए संशोधन में हटाई जा सकती हैं।",
  "Your session and event data": "आपका सत्र और कार्यक्रम डेटा",
  "Firebase provides an anonymous identity in this browser. There is no password, recovery email, or permanent account. Signing out or clearing browser storage loses access to events this identity owns.":
    "Firebase इस ब्राउज़र में एक अनाम पहचान देता है। कोई पासवर्ड, रिकवरी ईमेल या स्थायी खाता नहीं है। साइन आउट करने या ब्राउज़र स्टोरेज साफ़ करने पर इस पहचान के कार्यक्रमों की पहुँच चली जाएगी।",
  "Events expire after 72 hours. The demo permits two event creations per identity per day plus a shared project cap. Workspace shortcuts are saved only on this browser; they are not an account-wide event list.":
    "कार्यक्रम 72 घंटे बाद समाप्त हो जाते हैं। डेमो हर पहचान को प्रतिदिन दो कार्यक्रम बनाने देता है और एक साझा परियोजना सीमा भी लागू है। कार्यक्षेत्र शॉर्टकट केवल इस ब्राउज़र में सहेजे जाते हैं; वे खाते की पूरी कार्यक्रम सूची नहीं हैं।",
  "The latest published snapshot is stored locally for read-only network recovery. Offline status always includes a revision and last-sync time. A cold offline page load is not guaranteed. Sign-out and event deletion clear local snapshots.":
    "नवीनतम प्रकाशित स्नैपशॉट केवल-पढ़ने योग्य नेटवर्क रिकवरी के लिए स्थानीय रूप से सहेजा जाता है। ऑफ़लाइन स्थिति में हमेशा संशोधन और अंतिम सिंक समय दिखता है। पहली बार ऑफ़लाइन पेज खुलना सुनिश्चित नहीं है। साइन आउट और कार्यक्रम हटाने पर स्थानीय स्नैपशॉट मिट जाते हैं।",
  "Stage operating limits": "मंच संचालन सीमाएँ",
  "One stage, fixed cue order, whole-minute scheduling, and an event of up to four hours. Structural agenda edits are draft-only. Acknowledgment means the anchor received a revision; it does not mean the words were spoken.":
    "एक मंच, निश्चित संकेत क्रम, पूरे मिनटों में शेड्यूलिंग और अधिकतम चार घंटे का कार्यक्रम। कार्यसूची के संरचनात्मक बदलाव केवल ड्राफ्ट में होते हैं। पुष्टि का अर्थ है कि संचालक को संशोधन मिला; इसका अर्थ यह नहीं कि शब्द बोले गए।",
  "Times display in Asia/Kolkata (IST). The interface is available in English, Hindi, and Gujarati; approved script language follows the metadata supplied by the backend.":
    "समय Asia/Kolkata (IST) में दिखता है। इंटरफ़ेस अंग्रेज़ी, हिंदी और गुजराती में उपलब्ध है; स्वीकृत स्क्रिप्ट की भाषा बैकएंड से मिले मेटाडेटा के अनुसार होती है।",
  "This invitation is incomplete": "यह निमंत्रण अधूरा है",
  "This invitation could not be accepted": "यह निमंत्रण स्वीकार नहीं हुआ",
  "Connecting you to the stage": "आपको मंच से जोड़ा जा रहा है",
  "The link has no invitation code. Ask your organizer for a new link.":
    "इस लिंक में निमंत्रण कोड नहीं है। अपने आयोजक से नया लिंक माँगें।",
  "Accepting your private invitation…":
    "आपका निजी निमंत्रण स्वीकार किया जा रहा है…",
  "Invitations are single-use and expire after one hour. Your organizer can create a new invitation.":
    "निमंत्रण एक बार उपयोग होते हैं और एक घंटे बाद समाप्त हो जाते हैं। आपका आयोजक नया निमंत्रण बना सकता है।",
  "Back to your events": "अपने कार्यक्रमों पर वापस जाएँ",
  "Waiting for the organizer to publish the runbook.":
    "आयोजक द्वारा रनबुक प्रकाशित किए जाने की प्रतीक्षा है।",
  "Loading the published runbook…": "प्रकाशित रनबुक लोड हो रही है…",
  "Retry connection": "कनेक्शन फिर आज़माएँ",
  "Back to events": "कार्यक्रमों पर वापस जाएँ",
  "Runbook loaded, revision {revision}.": "रनबुक लोड हुई, संशोधन {revision}।",
  "Updated: revision {revision} published.":
    "अपडेट: संशोधन {revision} प्रकाशित हुआ।",
  "ANCHOR RUNBOOK": "संचालक रनबुक",
  "Refresh runbook": "रनबुक रीफ़्रेश करें",
  "Print runbook": "रनबुक प्रिंट करें",
  "Toggle fullscreen": "पूर्ण स्क्रीन बदलें",
  "Fullscreen is unavailable in this browser.":
    "इस ब्राउज़र में पूर्ण स्क्रीन उपलब्ध नहीं है।",
  "Organizer preview. Only an invited anchor can acknowledge this runbook.":
    "आयोजक पूर्वावलोकन। केवल आमंत्रित संचालक इस रनबुक की पुष्टि कर सकता है।",
  "Return to console": "कंसोल पर लौटें",
  "Schedule needs repair": "शेड्यूल में सुधार चाहिए",
  "Cached copy": "कैश की गई प्रति",
  "Approved script": "स्वीकृत स्क्रिप्ट",
  "No approved copy for this cue yet. The organizer drafts and approves host copy from the Scripts page; it appears here once approved.":
    "इस संकेत के लिए अभी स्वीकृत प्रति नहीं है। आयोजक स्क्रिप्ट पेज से संचालक प्रति बनाकर स्वीकृत करता है; स्वीकृति के बाद वह यहाँ दिखती है।",
  "AI-generated copy · reviewed and approved":
    "AI-निर्मित प्रति · समीक्षा और स्वीकृति पूरी",
  "Human-written copy": "मानव-लिखित प्रति",
  Announcement: "घोषणा",
  "Acknowledging…": "पुष्टि की जा रही है…",
  "Acknowledged revision {revision}": "संशोधन {revision} की पुष्टि हुई",
  "Acknowledge revision {revision}": "संशोधन {revision} की पुष्टि करें",
  "Behind: you acknowledged revision {revision}":
    "पीछे हैं: आपने संशोधन {revision} की पुष्टि की",
  "Acknowledgement confirms you received this revision. It does not confirm the words have been spoken.":
    "पुष्टि बताती है कि आपको यह संशोधन मिला। यह पुष्टि नहीं करती कि शब्द बोले गए।",
  "Complete published agenda": "पूर्ण प्रकाशित कार्यसूची",
  "All approved host copy": "सभी स्वीकृत संचालक प्रतियाँ",
  "Speaker pronunciation & facts": "वक्ता उच्चारण और तथ्य",
  "Approved {time}": "{time} पर स्वीकृत",
  "Published revision {revision} · Last synced {time} · Times in IST. Printed copies do not update.":
    "प्रकाशित संशोधन {revision} · अंतिम सिंक {time} · समय IST में। प्रिंट की गई प्रतियाँ अपडेट नहीं होतीं।",
  "not synced": "सिंक नहीं हुआ",
  "A clear plan. A connected team. A stage under control.":
    "स्पष्ट योजना। जुड़ी हुई टीम। नियंत्रण में मंच।",
  "Join an event": "कार्यक्रम से जुड़ें",
  "Try fictional rehearsal": "काल्पनिक रिहर्सल आज़माएँ",
  "Create event": "कार्यक्रम बनाएँ",
  "YOUR STAGE, IN SYNC": "आपका मंच, तालमेल में",
  "Keep the show moving together.": "कार्यक्रम को साथ मिलकर आगे बढ़ाएँ।",
  "Prepare your rundown, protect your timing, and keep your anchor on the same page.":
    "अपनी रूपरेखा तैयार करें, समय सुरक्षित रखें और अपने संचालक को एक ही जानकारी पर रखें।",
  "Explore the workflow": "कार्यप्रवाह देखें",
  "Workflow: prepare, publish, perform":
    "कार्यप्रवाह: तैयार करें, प्रकाशित करें, प्रस्तुत करें",
  Prepare: "तैयार करें",
  "Every cue in its place": "हर संकेत अपनी जगह",
  Publish: "प्रकाशित करें",
  "One approved runbook": "एक स्वीकृत रनबुक",
  Perform: "प्रस्तुत करें",
  "Everyone on the same cue": "सभी एक ही संकेत पर",
  "Filter events": "कार्यक्रम फ़िल्टर करें",
  "All events": "सभी कार्यक्रम",
  Drafts: "ड्राफ्ट",
  Running: "चल रहे",
  Joined: "जुड़े हुए",
  "Search events": "कार्यक्रम खोजें",
  "Search your events…": "अपने कार्यक्रम खोजें…",
  "{count} event in this browser": "इस ब्राउज़र में {count} कार्यक्रम",
  "{count} events in this browser": "इस ब्राउज़र में {count} कार्यक्रम",
  "Checking latest status…": "नवीनतम स्थिति जाँची जा रही है…",
  "Some events could not be refreshed": "कुछ कार्यक्रम रीफ़्रेश नहीं हो सके",
  "Status checked when this page opened": "पेज खुलते समय स्थिति जाँची गई",
  "No matching events": "कोई मेल खाता कार्यक्रम नहीं",
  "Your next event starts here": "आपका अगला कार्यक्रम यहाँ से शुरू होता है",
  "Try a different search or filter to find your event.":
    "अपना कार्यक्रम खोजने के लिए दूसरी खोज या फ़िल्टर आज़माएँ।",
  "Create an event to build your agenda, or join your organizer’s invitation.":
    "कार्यसूची बनाने के लिए कार्यक्रम बनाएँ, या आयोजक के निमंत्रण से जुड़ें।",
  "Clear filters": "फ़िल्टर साफ़ करें",
  Checking: "जाँच जारी",
  Anchor: "संचालक",
  Unavailable: "अनुपलब्ध",
  "Waiting for publication": "प्रकाशन की प्रतीक्षा",
  "Saved event shortcut": "सहेजा गया कार्यक्रम शॉर्टकट",
  "{count} cues": "{count} संकेत",
  "{count} min": "{count} मिनट",
  Rehearsal: "रिहर्सल",
  "Live mode": "लाइव मोड",
  Organizer: "आयोजक",
  Unpublished: "अप्रकाशित",
  "Published R{revision}": "प्रकाशित R{revision}",
  "Open event": "कार्यक्रम खोलें",
  "Remove shortcut": "शॉर्टकट हटाएँ",
  "Already have an event ID?": "क्या आपके पास कार्यक्रम ID पहले से है?",
  "Open an event this identity owns or has joined.":
    "इस पहचान के स्वामित्व वाला या इससे जुड़ा कार्यक्रम खोलें।",
  "Event ID": "कार्यक्रम ID",
  "Paste event ID": "कार्यक्रम ID पेस्ट करें",
  "Opening…": "खोला जा रहा है…",
  "Browser-local workspace · Anonymous identity · Events expire after 72 hours":
    "ब्राउज़र-स्थानीय कार्यक्षेत्र · अनाम पहचान · कार्यक्रम 72 घंटे बाद समाप्त होते हैं",
  "Try the fictional rehearsal?": "काल्पनिक रिहर्सल आज़माएँ?",
  "Creates a personal, labeled rehearsal event seeded with the committed six-cue scenario.":
    "स्वीकृत छह-संकेत परिदृश्य से भरा, आपका निजी और स्पष्ट लेबल वाला रिहर्सल कार्यक्रम बनाता है।",
  "Opening → keynote → Q&A → community interaction → sponsor fixed at 10:45 → closing at 11:00. Every speaker, fact and event detail is fictional, and the scenario clock is controlled by you.":
    "उद्घाटन → मुख्य भाषण → प्रश्नोत्तर → सामुदायिक संवाद → प्रायोजक 10:45 पर निश्चित → समापन 11:00 पर। हर वक्ता, तथ्य और कार्यक्रम विवरण काल्पनिक है और परिदृश्य घड़ी आपके नियंत्रण में है।",
  "REHEARSAL · fictional event and speakers · scenario clock.":
    "रिहर्सल · काल्पनिक कार्यक्रम और वक्ता · परिदृश्य घड़ी।",
  Cancel: "रद्द करें",
  "Creating…": "बनाया जा रहा है…",
  "Create rehearsal": "रिहर्सल बनाएँ",
  "Create your event": "अपना कार्यक्रम बनाएँ",
  "Start with a blank agenda. You can load the fictional scenario in rehearsal setup.":
    "खाली कार्यसूची से शुरू करें। रिहर्सल सेटअप में काल्पनिक परिदृश्य लोड किया जा सकता है।",
  "Event name": "कार्यक्रम का नाम",
  "e.g. Campus innovation summit": "जैसे, कैंपस नवाचार सम्मेलन",
  "Start date & time (IST)": "शुरुआत की तारीख और समय (IST)",
  "Hard finish, minutes after start": "अनिवार्य समाप्ति, शुरुआत के बाद मिनट",
  "Event mode": "कार्यक्रम मोड",
  "Rehearsal · manual scenario clock": "रिहर्सल · मैन्युअल परिदृश्य घड़ी",
  "Live · actual server clock": "लाइव · वास्तविक सर्वर घड़ी",
  "Mode cannot change after creation. Demo data expires after 72 hours. Maximum two creations per identity per day; shared capacity also applies.":
    "बनाने के बाद मोड नहीं बदला जा सकता। डेमो डेटा 72 घंटे बाद समाप्त होता है। हर पहचान प्रतिदिन अधिकतम दो कार्यक्रम बना सकती है; साझा क्षमता सीमा भी लागू है।",
  "Keep this browser session. Signing out or clearing browser storage loses access to your events.":
    "यह ब्राउज़र सत्र बनाए रखें। साइन आउट करने या ब्राउज़र स्टोरेज साफ़ करने पर कार्यक्रमों की पहुँच चली जाएगी।",
  "Join as an anchor": "संचालक के रूप में जुड़ें",
  "Use the private invitation link your organizer shared with you.":
    "आयोजक द्वारा साझा किया गया निजी निमंत्रण लिंक उपयोग करें।",
  "Invitation link": "निमंत्रण लिंक",
  "Invitations are single-use and expire after one hour.":
    "निमंत्रण एक बार उपयोग होते हैं और एक घंटे बाद समाप्त हो जाते हैं।",
  "Open invitation": "निमंत्रण खोलें",
  "Enter an event name, a start time, and a duration from 1 to 240 minutes.":
    "कार्यक्रम का नाम, शुरुआत का समय और 1 से 240 मिनट की अवधि दर्ज करें।",
  "Choose a valid event start time.": "कार्यक्रम की मान्य शुरुआत चुनें।",
  "Paste the complete invitation link, including its code.":
    "कोड सहित पूरा निमंत्रण लिंक पेस्ट करें।",
  "Enter a valid event ID.": "मान्य कार्यक्रम ID दर्ज करें।",
  draft: "ड्राफ्ट",
  running: "चल रहा है",
  ended: "समाप्त",
  completed: "पूर्ण",
  "Event complete": "कार्यक्रम पूर्ण",
  "Rehearsal in progress": "रिहर्सल जारी",
  "Rehearsal · scenario clock": "रिहर्सल · परिदृश्य घड़ी",
  "Running now": "अभी चल रहा है",
  "Starts in {time}": "{time} में शुरू होगा",
  "Scheduled start reached · unpublished": "निर्धारित शुरुआत आ गई · अप्रकाशित",
  "Approved facts, pronunciation, and the cues each person is part of.":
    "स्वीकृत तथ्य, उच्चारण और वे संकेत जिनका प्रत्येक व्यक्ति हिस्सा है।",
  "Reviewed host copy, tied to your event’s approved facts.":
    "समीक्षित संचालक प्रति, आपके कार्यक्रम के स्वीकृत तथ्यों से जुड़ी।",
  "Published messages shared with your anchor.":
    "आपके संचालक से साझा प्रकाशित संदेश।",
  "An immutable record of changes to the event.":
    "कार्यक्रम बदलावों का अपरिवर्तनीय रिकॉर्ड।",
  "Event details, retention, and workspace controls.":
    "कार्यक्रम विवरण, अवधारण और कार्यक्षेत्र नियंत्रण।",
  "Loading {page}": "{page} लोड हो रहा है",
  "The server did not return an event.": "सर्वर ने कार्यक्रम वापस नहीं किया।",
  "Revision {revision}": "संशोधन {revision}",
  "Refresh page": "पेज रीफ़्रेश करें",
  "Search speakers": "वक्ता खोजें",
  "Find a speaker…": "वक्ता खोजें…",
  "Edit speakers": "वक्ता संपादित करें",
  "Facts locked after publication": "प्रकाशन के बाद तथ्य लॉक हैं",
  "No matching speakers": "कोई मेल खाता वक्ता नहीं",
  "No speakers added yet": "अभी कोई वक्ता नहीं जोड़ा गया",
  "Try another name.": "दूसरा नाम आज़माएँ।",
  "Add speakers and approved facts in event setup.":
    "कार्यक्रम सेटअप में वक्ता और स्वीकृत तथ्य जोड़ें।",
  "No pronunciation hint added": "उच्चारण संकेत नहीं जोड़ा गया",
  "Approved facts": "स्वीकृत तथ्य",
  "No approved facts yet.": "अभी कोई स्वीकृत तथ्य नहीं।",
  "Event facts": "कार्यक्रम तथ्य",
  "Draft host copy from approved facts": "स्वीकृत तथ्यों से संचालक प्रति बनाएँ",
  "The model only ever sees facts you approved, and it never sets a time. Every draft is reviewed by you before it reaches the stage.":
    "मॉडल केवल आपके स्वीकृत तथ्य देखता है और कभी समय तय नहीं करता। मंच तक पहुँचने से पहले हर ड्राफ्ट की समीक्षा आप करते हैं।",
  "Generate a draft": "ड्राफ्ट बनाएँ",
  Kind: "प्रकार",
  Opening: "उद्घाटन",
  "Speaker introduction": "वक्ता परिचय",
  Transition: "परिवर्तन",
  Closing: "समापन",
  Language: "भाषा",
  "No specific cue": "कोई विशिष्ट संकेत नहीं",
  "Drafting…": "ड्राफ्ट बन रहा है…",
  "Generate draft": "ड्राफ्ट बनाएँ",
  "Hindi and Gujarati output is marked “generated; language quality unverified” until a qualified reviewer has read it.":
    "हिंदी और गुजराती आउटपुट को योग्य समीक्षक द्वारा पढ़े जाने तक “निर्मित; भाषा गुणवत्ता अप्रमाणित” चिह्नित किया जाता है।",
  "Approved host copy": "स्वीकृत संचालक प्रति",
  "All languages": "सभी भाषाएँ",
  "No approved scripts": "कोई स्वीकृत स्क्रिप्ट नहीं",
  "Generate a draft above, review it against your approved facts, then publish it to the anchor.":
    "ऊपर ड्राफ्ट बनाएँ, स्वीकृत तथ्यों से मिलान करें, फिर संचालक के लिए प्रकाशित करें।",
  "View source facts": "स्रोत तथ्य देखें",
  "Approved script & source facts": "स्वीकृत स्क्रिप्ट और स्रोत तथ्य",
  "Read-only provenance for the approved copy.":
    "स्वीकृत प्रति का केवल-पढ़ने योग्य स्रोत विवरण।",
  "Referenced facts": "संदर्भित तथ्य",
  "Referenced fact is not present in this snapshot.":
    "संदर्भित तथ्य इस स्नैपशॉट में नहीं है।",
  Source: "स्रोत",
  Model: "मॉडल",
  "Publish a message to your anchor": "अपने संचालक के लिए संदेश प्रकाशित करें",
  "You write every word. Publishing is the approval step, and the message travels in the same published snapshot as the schedule.":
    "हर शब्द आप लिखते हैं। प्रकाशन ही स्वीकृति चरण है और संदेश शेड्यूल वाले उसी प्रकाशित स्नैपशॉट में जाता है।",
  "New announcement": "नई घोषणा",
  Message: "संदेश",
  "Type the exact words the anchor should see.":
    "संचालक को दिखने वाले सटीक शब्द लिखें।",
  "{count}/500 characters": "{count}/500 अक्षर",
  "Publish announcement": "घोषणा प्रकाशित करें",
  "CuePilot never writes an announcement for you. There is no automatic emergency wording.":
    "CuePilot आपके लिए घोषणा नहीं लिखता। कोई स्वचालित आपातकालीन शब्दावली नहीं है।",
  "Announcement filter": "घोषणा फ़िल्टर",
  Active: "सक्रिय",
  "All messages": "सभी संदेश",
  "No announcements here": "यहाँ कोई घोषणा नहीं",
  "Published messages will be shown here and in the anchor runbook. No message has been sent.":
    "प्रकाशित संदेश यहाँ और संचालक रनबुक में दिखेंगे। कोई संदेश नहीं भेजा गया है।",
  Dismissed: "हटाया गया",
  "Dismiss banner": "बैनर हटाएँ",
  "Retry history": "इतिहास फिर लोड करें",
  "Loading revision history": "संशोधन इतिहास लोड हो रहा है",
  "No published revisions yet": "अभी कोई प्रकाशित संशोधन नहीं",
  "Save your draft and publish it from the stage console to create a runbook revision.":
    "रनबुक संशोधन बनाने के लिए ड्राफ्ट सहेजें और मंच कंसोल से प्रकाशित करें।",
  Revision: "संशोधन",
  Change: "बदलाव",
  "Published at": "प्रकाशन समय",
  Actor: "कर्ता",
  Details: "विवरण",
  "View revision {revision}": "संशोधन {revision} देखें",
  "Loading…": "लोड हो रहा है…",
  "Load older revisions": "पुराने संशोधन लोड करें",
  "Published snapshots are immutable. Restoring an old snapshot is not supported.":
    "प्रकाशित स्नैपशॉट अपरिवर्तनीय हैं। पुराना स्नैपशॉट पुनर्स्थापित करना समर्थित नहीं है।",
  "Historical snapshot. This is not the current stage view.":
    "ऐतिहासिक स्नैपशॉट। यह वर्तमान मंच दृश्य नहीं है।",
  "Loading revision": "संशोधन लोड हो रहा है",
  "Schedule valid": "शेड्यूल मान्य",
  "Needs repair": "सुधार चाहिए",
  "Updated {time}": "अपडेट {time}",
  "Approved copy": "स्वीकृत प्रति",
  "No approved scripts in this revision.":
    "इस संशोधन में कोई स्वीकृत स्क्रिप्ट नहीं।",
  dismissed: "हटाया गया",
  active: "सक्रिय",
  "No announcements in this revision.": "इस संशोधन में कोई घोषणा नहीं।",
  "Published agenda": "प्रकाशित कार्यसूची",
  "Time (IST)": "समय (IST)",
  Speaker: "वक्ता",
  Status: "स्थिति",
  "Event identity": "कार्यक्रम पहचान",
  Name: "नाम",
  Mode: "मोड",
  Phase: "चरण",
  Timezone: "समय क्षेत्र",
  "Data expires": "डेटा समाप्ति",
  "Event ID copied.": "कार्यक्रम ID कॉपी हुई।",
  "Copy unavailable. Select the event ID above and copy it.":
    "कॉपी उपलब्ध नहीं। ऊपर कार्यक्रम ID चुनकर कॉपी करें।",
  "Copy event ID": "कार्यक्रम ID कॉपी करें",
  "Only this browser identity can manage the event. There is no permanent account or recovery flow. Invitations grant anchor access only.":
    "केवल यह ब्राउज़र पहचान कार्यक्रम प्रबंधित कर सकती है। कोई स्थायी खाता या रिकवरी प्रक्रिया नहीं है। निमंत्रण केवल संचालक पहुँच देते हैं।",
  "Owner ID:": "स्वामी ID:",
  "Delete event": "कार्यक्रम हटाएँ",
  "This permanently removes the event, its runbook, revisions, and anchor access. Local shortcuts and snapshots are also cleared.":
    "यह कार्यक्रम, रनबुक, संशोधन और संचालक पहुँच स्थायी रूप से हटाता है। स्थानीय शॉर्टकट और स्नैपशॉट भी साफ़ होते हैं।",
  "Permanently delete this event?": "इस कार्यक्रम को स्थायी रूप से हटाएँ?",
  "This cannot be undone. Anchors will lose access to the published runbook.":
    "इसे वापस नहीं किया जा सकता। संचालकों की प्रकाशित रनबुक तक पहुँच चली जाएगी।",
  "Type DELETE to confirm": "पुष्टि के लिए DELETE लिखें",
  "The event is no longer available. A previous deletion may have succeeded.":
    "कार्यक्रम अब उपलब्ध नहीं है। पहले किया गया हटाना सफल हो सकता है।",
  "Remove local copy": "स्थानीय प्रति हटाएँ",
  "Refresh event before deleting": "हटाने से पहले कार्यक्रम रीफ़्रेश करें",
  "Keep event": "कार्यक्रम रखें",
  "Deleting…": "हटाया जा रहा है…",
  "Delete permanently": "स्थायी रूप से हटाएँ",
  "Loading event setup": "कार्यक्रम सेटअप लोड हो रहा है",
  "This agenda is published": "यह कार्यसूची प्रकाशित है",
  "Structural changes and speaker fact editing are available only before publication.":
    "संरचनात्मक बदलाव और वक्ता तथ्य संपादन केवल प्रकाशन से पहले उपलब्ध हैं।",
  "Return to stage console": "मंच कंसोल पर लौटें",
  "Preferred duration": "पसंदीदा अवधि",
  "Minimum duration": "न्यूनतम अवधि",
  "Shortening priority": "संक्षिप्तीकरण प्राथमिकता",
  "Buffer before cue": "संकेत से पहले अंतराल",
  "Available from minute": "इस मिनट से उपलब्ध",
  "Fixed start minute": "निश्चित शुरुआत मिनट",
  "That file could not be read as text.":
    "उस फ़ाइल को टेक्स्ट के रूप में नहीं पढ़ा जा सका।",
  "Add at least one cue to your agenda.":
    "अपनी कार्यसूची में कम से कम एक संकेत जोड़ें।",
  "Approved fact {number}": "स्वीकृत तथ्य {number}",
  "Remove {prefix} fact {number}": "{prefix} तथ्य {number} हटाएँ",
  "Add approved fact": "स्वीकृत तथ्य जोड़ें",
  "Build your agenda and define the commitments your schedule must protect.":
    "अपनी कार्यसूची बनाएँ और वे प्रतिबद्धताएँ तय करें जिन्हें शेड्यूल सुरक्षित रखे।",
  "Draft · revision {revision}": "ड्राफ्ट · संशोधन {revision}",
  "Setup sections": "सेटअप अनुभाग",
  "Agenda · {count}": "कार्यसूची · {count}",
  "Speakers & facts · {count}": "वक्ता और तथ्य · {count}",
  "Event details": "कार्यक्रम विवरण",
  "All times in IST": "सभी समय IST में",
  "Start date & time": "शुरुआत की तारीख और समय",
  "Hard finish (minutes after start)": "अनिवार्य समाप्ति (शुरुआत के बाद मिनट)",
  "The hard finish is a protected commitment, not a suggested duration. Mode: {mode}.":
    "अनिवार्य समाप्ति एक सुरक्षित प्रतिबद्धता है, सुझाई गई अवधि नहीं। मोड: {mode}।",
  "Approved event facts": "स्वीकृत कार्यक्रम तथ्य",
  "Keep names and context accurate. These facts are retained with their original IDs.":
    "नाम और संदर्भ सही रखें। ये तथ्य अपनी मूल ID के साथ सुरक्षित रहते हैं।",
  "Try the fictional TechFest scenario": "काल्पनिक TechFest परिदृश्य आज़माएँ",
  "Six cues, three fictional speakers, a fixed sponsor start, and a 60-minute finish.":
    "छह संकेत, तीन काल्पनिक वक्ता, प्रायोजक की निश्चित शुरुआत और 60 मिनट में समाप्ति।",
  "Load scenario": "परिदृश्य लोड करें",
  "Shape the running order": "कार्यक्रम क्रम बनाएँ",
  "Times are whole-minute offsets from the event start. The server calculates the schedule when you save.":
    "समय कार्यक्रम की शुरुआत से पूरे मिनटों का अंतर है। सहेजते समय सर्वर शेड्यूल गणना करता है।",
  "Import CSV": "CSV आयात करें",
  "Add cue": "संकेत जोड़ें",
  "Build your running order": "अपना कार्यक्रम क्रम बनाएँ",
  "Add your opening, sessions, transitions, and closing. You can reorder cues before publication.":
    "उद्घाटन, सत्र, परिवर्तन और समापन जोड़ें। प्रकाशन से पहले संकेतों का क्रम बदला जा सकता है।",
  "CUE {number}": "संकेत {number}",
  "Move cue {number} up": "संकेत {number} ऊपर ले जाएँ",
  "Move cue {number} down": "संकेत {number} नीचे ले जाएँ",
  "Remove cue {number}": "संकेत {number} हटाएँ",
  "Cue title": "संकेत शीर्षक",
  "No assigned speaker": "कोई वक्ता नियुक्त नहीं",
  "Unnamed speaker": "बिना नाम का वक्ता",
  "Not set": "सेट नहीं",
  "Higher shortening priority protects this cue more strongly. Minimum duration must not exceed preferred duration.":
    "अधिक संक्षिप्तीकरण प्राथमिकता इस संकेत को अधिक सुरक्षित रखती है। न्यूनतम अवधि पसंदीदा अवधि से अधिक नहीं होनी चाहिए।",
  "People behind the programme": "कार्यक्रम के लोग",
  "Add pronunciation and approved facts for the host. Up to 20 speakers and ten facts per speaker.":
    "संचालक के लिए उच्चारण और स्वीकृत तथ्य जोड़ें। अधिकतम 20 वक्ता और हर वक्ता के दस तथ्य।",
  "Add speaker": "वक्ता जोड़ें",
  "Put a name to each cue": "हर संकेत को एक नाम दें",
  "Add speakers, then assign them to cues in your agenda.":
    "वक्ता जोड़ें, फिर उन्हें कार्यसूची के संकेतों से जोड़ें।",
  "Speaker {number}": "वक्ता {number}",
  "Remove speaker {number}": "वक्ता {number} हटाएँ",
  "Full name": "पूरा नाम",
  "Pronunciation hint (optional)": "उच्चारण संकेत (वैकल्पिक)",
  "Unsaved changes": "असहेजे बदलाव",
  "Draft loaded": "ड्राफ्ट लोड हुआ",
  "Saving does not publish": "सहेजने से प्रकाशन नहीं होता",
  "Next section": "अगला अनुभाग",
  "Saving…": "सहेजा जा रहा है…",
  "Save & review": "सहेजें और समीक्षा करें",
  "Check your draft before saving": "सहेजने से पहले ड्राफ्ट जाँचें",
  "Reload latest draft (discard edits)":
    "नवीनतम ड्राफ्ट फिर लोड करें (संपादन हटाएँ)",
  "Load the fictional scenario?": "काल्पनिक परिदृश्य लोड करें?",
  "This replaces your unsaved agenda and speaker facts with the labelled TechFest rehearsal.":
    "यह आपकी असहेजी कार्यसूची और वक्ता तथ्यों को लेबल वाली TechFest रिहर्सल से बदल देता है।",
  "Opening → keynote → Q&A → community → sponsor → closing. The sponsor is fixed at minute 45; hard finish is minute 60.":
    "उद्घाटन → मुख्य भाषण → प्रश्नोत्तर → समुदाय → प्रायोजक → समापन। प्रायोजक 45वें मिनट पर और अनिवार्य समाप्ति 60वें मिनट पर है।",
  "Import an agenda from CSV": "CSV से कार्यसूची आयात करें",
  "Use the provided template, replace its example rows, then import. Imported cues are added to the current agenda and are not saved or published until you save the draft.":
    "दिया गया टेम्पलेट उपयोग करें, उदाहरण पंक्तियाँ बदलें, फिर आयात करें। आयातित संकेत वर्तमान कार्यसूची में जुड़ते हैं और ड्राफ्ट सहेजने तक सहेजे या प्रकाशित नहीं होते।",
  "Download template": "टेम्पलेट डाउनलोड करें",
  "CSV file": "CSV फ़ाइल",
  "Selected: {file}": "चयनित: {file}",
  "Fix these rows before importing": "आयात से पहले इन पंक्तियों को ठीक करें",
  "Import preview": "आयात पूर्वावलोकन",
  "Cues that will be added to the agenda":
    "कार्यसूची में जोड़े जाने वाले संकेत",
  "Pref / min": "पसंदीदा / न्यूनतम",
  "No speaker": "कोई वक्ता नहीं",
  "Add {count} cue": "{count} संकेत जोड़ें",
  "Add {count} cues": "{count} संकेत जोड़ें",
  "Add cues": "संकेत जोड़ें",
  "Leave your unsaved draft?": "असहेजा ड्राफ्ट छोड़ें?",
  "Your edits have not been saved to the event.":
    "आपके संपादन कार्यक्रम में सहेजे नहीं गए हैं।",
  "Keep editing": "संपादन जारी रखें",
  "Discard & leave": "हटाएँ और बाहर जाएँ",
  "Organizer console": "आयोजक कंसोल",
  "Loading stage console": "मंच कंसोल लोड हो रहा है",
  "Back to start": "शुरुआत पर वापस जाएँ",
  "Stage console · Every cue and every change in one place.":
    "मंच कंसोल · हर संकेत और हर बदलाव एक जगह।",
  "Refresh console": "कंसोल रीफ़्रेश करें",
  "revision {revision}": "संशोधन {revision}",
  "Event clock": "कार्यक्रम घड़ी",
  "Cues completed": "पूर्ण संकेत",
  "Anchor handoff": "संचालक सुपुर्दगी",
  Received: "प्राप्त",
  "Awaiting ack": "पुष्टि की प्रतीक्षा",
  Reconnect: "फिर जोड़ें",
  "Waiting for the server to confirm this action…":
    "सर्वर द्वारा इस कार्रवाई की पुष्टि की प्रतीक्षा है…",
  "Published runbook revision {revision}.": "रनबुक संशोधन {revision} प्रकाशित।",
  "Draft runbook. Not yet published.": "ड्राफ्ट रनबुक। अभी प्रकाशित नहीं।",
  Agenda: "कार्यसूची",
  "Event agenda": "कार्यक्रम कार्यसूची",
  Planned: "नियोजित",
  "Actual / forecast": "वास्तविक / अनुमानित",
  Rules: "नियम",
  forecast: "अनुमान",
  "rehearsal clock": "रिहर्सल घड़ी",
  "server clock": "सर्वर घड़ी",
  "fixed {time}": "निश्चित {time}",
  "from {time}": "{time} से",
  "buffer {minutes}": "अंतराल {minutes}",
  "No cues yet. Add the agenda on the setup screen before publishing.":
    "अभी कोई संकेत नहीं। प्रकाशन से पहले सेटअप स्क्रीन पर कार्यसूची जोड़ें।",
  "Seeded rehearsal": "पहले से भरी रिहर्सल",
  "This is the labeled fictional TechFest scenario. The action below publishes it and advances the opening so the keynote is active, using the normal stage commands — the same buttons a person would click.":
    "यह लेबल वाला काल्पनिक TechFest परिदृश्य है। नीचे की कार्रवाई सामान्य मंच कमांड का उपयोग करके इसे प्रकाशित करती है और उद्घाटन आगे बढ़ाकर मुख्य भाषण सक्रिय करती है—ठीक वही बटन जो कोई व्यक्ति दबाएगा।",
  "Load rehearsal at keynote": "मुख्य भाषण पर रिहर्सल लोड करें",
  "Publish the runbook": "रनबुक प्रकाशित करें",
  "Publishing validates the full draft and makes it visible to anchors. It does not start the first cue.":
    "प्रकाशन पूरे ड्राफ्ट की जाँच करके उसे संचालकों को दिखाता है। यह पहला संकेत शुरू नहीं करता।",
  "Edit agenda": "कार्यसूची संपादित करें",
  "Validate and publish": "जाँचें और प्रकाशित करें",
  "Run the stage": "मंच चलाएँ",
  "No cues left": "कोई संकेत बाकी नहीं",
  "Start {cue}": "{cue} शुरू करें",
  "Complete {cue}": "{cue} पूर्ण करें",
  "Scenario clock": "परिदृश्य घड़ी",
  "The scenario clock advances only forward. Actual times recorded while it is in use are labelled as rehearsal-clock times.":
    "परिदृश्य घड़ी केवल आगे बढ़ती है। इसके उपयोग के दौरान दर्ज वास्तविक समय रिहर्सल-घड़ी समय के रूप में चिह्नित होते हैं।",
  "+{minutes} min": "+{minutes} मिनट",
  "Report an overrun": "अतिरिक्त समय दर्ज करें",
  "A repair can be previewed between cues as well; with no active cue the plan is rebuilt from the current scenario minute.":
    "संकेतों के बीच भी रिकवरी का पूर्वावलोकन किया जा सकता है; सक्रिय संकेत न होने पर योजना वर्तमान परिदृश्य मिनट से फिर बनती है।",
  "{cue} currently forecasts {time}. Entering a delay sends a new absolute forecast end, so re-previewing never stacks the delay.":
    "{cue} का वर्तमान अनुमान {time} है। देरी दर्ज करने पर नई निश्चित अनुमानित समाप्ति भेजी जाती है, इसलिए दोबारा पूर्वावलोकन करने से देरी जुड़ती नहीं जाती।",
  "Delay in minutes": "देरी, मिनटों में",
  "New forecast end {time} ({minutes} min)":
    "नई अनुमानित समाप्ति {time} ({minutes} मिनट)",
  "Speaker arriving late?": "क्या वक्ता देर से आ रहे हैं?",
  "Pending cue": "लंबित संकेत",
  "No availability update": "उपलब्धता अपडेट नहीं",
  "Available from minute after start": "शुरुआत के बाद इस मिनट से उपलब्ध",
  "Calculating…": "गणना हो रही है…",
  "Preview recovery plan": "रिकवरी योजना का पूर्वावलोकन करें",
  "Published revision": "प्रकाशित संशोधन",
  "not published": "प्रकाशित नहीं",
  "No acknowledgements yet.": "अभी कोई पुष्टि नहीं।",
  current: "वर्तमान",
  behind: "पीछे",
  "revision {revision} at {time}": "संशोधन {revision}, {time} पर",
  "Publication success and acknowledgement are separate: the anchor may not have seen this revision yet.":
    "सफल प्रकाशन और पुष्टि अलग हैं: संचालक ने शायद यह संशोधन अभी नहीं देखा है।",
  "The anchor has acknowledged receiving this revision. That is not confirmation the words were spoken.":
    "संचालक ने यह संशोधन मिलने की पुष्टि की है। यह शब्द बोले जाने की पुष्टि नहीं है।",
  "Invite an anchor": "संचालक को आमंत्रित करें",
  "Preview anchor view": "संचालक दृश्य का पूर्वावलोकन करें",
  "Show invitation": "निमंत्रण दिखाएँ",
  "Invite your anchor": "अपने संचालक को आमंत्रित करें",
  "A private, single-use invitation. Valid for one hour.":
    "निजी, एक बार उपयोग होने वाला निमंत्रण। एक घंटे तक मान्य।",
  "Single-use invitation, valid one hour. Shown once — copy it now.":
    "एक बार उपयोग होने वाला निमंत्रण, एक घंटे तक मान्य। केवल एक बार दिखेगा—अभी कॉपी करें।",
  "Open it in a different browser profile or an incognito window: the same profile would join as you, the owner.":
    "इसे अलग ब्राउज़र प्रोफ़ाइल या गुप्त विंडो में खोलें: वही प्रोफ़ाइल मालिक के रूप में जुड़ जाएगी।",
  "Invitation copied.": "निमंत्रण कॉपी हुआ।",
  "Copy unavailable. Select and copy the link above.":
    "कॉपी उपलब्ध नहीं। ऊपर लिंक चुनकर कॉपी करें।",
  "Copy invitation link": "निमंत्रण लिंक कॉपी करें",
  "Signed in as {uid}. Demo data expires {time}.":
    "{uid} के रूप में साइन इन। डेमो डेटा {time} पर समाप्त होता है।",
  "Load rehearsal at keynote?": "मुख्य भाषण पर रिहर्सल लोड करें?",
  "Publishes the seeded draft and advances the opening so the keynote is active, using the normal stage commands only.":
    "पहले से भरे ड्राफ्ट को प्रकाशित करता है और केवल सामान्य मंच कमांड से उद्घाटन आगे बढ़ाकर मुख्य भाषण सक्रिय करता है।",
  "The commands run in order — publish, start and complete the opening, advance the scenario clock to each published cue boundary, then start the keynote. No rule is bypassed and every step is an ordinary idempotent command.":
    "कमांड क्रम से चलते हैं—प्रकाशित करना, उद्घाटन शुरू और पूर्ण करना, परिदृश्य घड़ी को हर प्रकाशित संकेत सीमा तक बढ़ाना, फिर मुख्य भाषण शुरू करना। कोई नियम नहीं टलता और हर चरण सामान्य पुनरावृत्ति-सुरक्षित कमांड है।",
  "Publish the runbook?": "रनबुक प्रकाशित करें?",
  "This validates your draft and shares the approved agenda with your anchor. Direct agenda and fact editing closes after publication.":
    "यह आपके ड्राफ्ट की जाँच करके स्वीकृत कार्यसूची संचालक से साझा करता है। प्रकाशन के बाद सीधे कार्यसूची और तथ्य संपादन बंद हो जाता है।",
  "{count} cues · Hard finish {time} IST":
    "{count} संकेत · अनिवार्य समाप्ति {time} IST",
  "Keep reviewing": "समीक्षा जारी रखें",
  "Review the recovery plan": "रिकवरी योजना की समीक्षा करें",
  "Check every timing change before publishing a new revision.":
    "नया संशोधन प्रकाशित करने से पहले हर समय बदलाव जाँचें।",
} satisfies Dictionary;

const gu: { [Key in keyof typeof hi]: string } = {
  "Your events": "તમારા કાર્યક્રમો",
  "Event workspace": "કાર્યક્રમ કાર્યક્ષેત્ર",
  "Stage console": "મંચ કન્સોલ",
  "Event setup": "કાર્યક્રમ સેટઅપ",
  "Speakers & facts": "વક્તાઓ અને તથ્યો",
  "Host scripts": "સંચાલક સ્ક્રિપ્ટ્સ",
  Announcements: "જાહેરાતો",
  "Revision history": "સુધારા ઇતિહાસ",
  "Event settings": "કાર્યક્રમ સેટિંગ્સ",
  "Anchor view": "એન્કર દૃશ્ય",
  "Anchor runbook": "એન્કર રનબુક",
  "Help & guide": "સહાય અને માર્ગદર્શિકા",
  Help: "સહાય",
  "Sign out": "સાઇન આઉટ",
  "Signing out…": "સાઇન આઉટ થઈ રહ્યું છે…",
  "Your workspace": "તમારું કાર્યક્ષેત્ર",
  Workspace: "કાર્યક્ષેત્ર",
  "Anonymous session": "અનામી સત્ર",
  "Skip to content": "મુખ્ય સામગ્રી પર જાઓ",
  "Stage workspace": "મંચ કાર્યક્ષેત્ર",
  "One stage. One shared plan.": "એક મંચ. એક સહિયારી યોજના.",
  "Main navigation": "મુખ્ય નેવિગેશન",
  "Human-led. Stage-ready.": "માનવ-સંચાલિત. મંચ માટે તૈયાર.",
  "Single-stage event control": "એકલ-મંચ કાર્યક્રમ નિયંત્રણ",
  "Open navigation": "નેવિગેશન ખોલો",
  "Interface language": "ઇન્ટરફેસ ભાષા",
  "Navigate your event.": "તમારા કાર્યક્રમમાં નેવિગેટ કરો.",
  "Mobile navigation": "મોબાઇલ નેવિગેશન",
  "Sign out of CuePilot?": "CuePilotમાંથી સાઇન આઉટ કરશો?",
  "This is an anonymous session. Signing out loses access to events owned by this identity. There is no account recovery in this build.":
    "આ એક અનામી સત્ર છે. સાઇન આઉટ કરવાથી આ ઓળખના કાર્યક્રમોની ઍક્સેસ ગુમાવશો. આ સંસ્કરણમાં એકાઉન્ટ પુનઃપ્રાપ્તિ ઉપલબ્ધ નથી.",
  "Local event shortcuts and offline snapshots will be cleared. Server data remains until you delete the event or its 72-hour expiry.":
    "સ્થાનિક કાર્યક્રમ શૉર્ટકટ્સ અને ઑફલાઇન સ્નૅપશૉટ્સ સાફ થશે. કાર્યક્રમ કાઢી નાખો અથવા 72 કલાકની મુદત પૂરી થાય ત્યાં સુધી સર્વર ડેટા રહેશે.",
  "Keep working": "કામ ચાલુ રાખો",
  "Could not sign out. Try again.": "સાઇન આઉટ થઈ શક્યું નહીં. ફરી પ્રયાસ કરો.",
  "Connect your workspace.": "તમારું કાર્યક્ષેત્ર જોડો.",
  "Firebase and API configuration are required before your event data can load.":
    "તમારા કાર્યક્રમનો ડેટા લોડ થાય તે પહેલાં Firebase અને API રૂપરેખાંકન જરૂરી છે.",
  "Missing public configuration": "જાહેર રૂપરેખાંકન ઉપલબ્ધ નથી",
  "Copy apps/web/.env.example to apps/web/.env.local, enter your project values, then restart Vite.":
    "apps/web/.env.example ને apps/web/.env.local માં કૉપી કરો, તમારા પ્રોજેક્ટના મૂલ્યો ભરો, પછી Vite ફરી શરૂ કરો.",
  "Enable Firebase anonymous authentication and authorize this domain. Server secrets do not belong in frontend configuration.":
    "Firebase અનામી પ્રમાણીકરણ સક્ષમ કરો અને આ ડોમેનને અધિકૃત કરો. સર્વર સિક્રેટ્સ ફ્રન્ટએન્ડ રૂપરેખાંકનમાં ન હોવા જોઈએ.",
  "Check configuration again": "રૂપરેખાંકન ફરી તપાસો",
  "Restoring your secure session":
    "તમારું સુરક્ષિત સત્ર પુનઃસ્થાપિત થઈ રહ્યું છે",
  "You’re signed out.": "તમે સાઇન આઉટ થયા છો.",
  "Your stage awaits.": "તમારો મંચ તૈયાર છે.",
  "Local event shortcuts and offline snapshots have been cleared.":
    "સ્થાનિક કાર્યક્રમ શૉર્ટકટ્સ અને ઑફલાઇન સ્નૅપશૉટ્સ સાફ થઈ ગયા છે.",
  "Continue with an anonymous browser identity to create or join an event.":
    "કાર્યક્રમ બનાવવા અથવા જોડાવા માટે અનામી બ્રાઉઝર ઓળખ સાથે આગળ વધો.",
  "Retry sign-in": "ફરી સાઇન ઇન કરો",
  "Start a new session": "નવું સત્ર શરૂ કરો",
  "Anonymous sessions cannot be recovered after sign-out. No email or password is required.":
    "સાઇન આઉટ પછી અનામી સત્ર પુનઃપ્રાપ્ત થઈ શકતું નથી. ઈમેલ અથવા પાસવર્ડ જરૂરી નથી.",
  "Your session is active": "તમારું સત્ર સક્રિય છે",
  "You’re using an anonymous browser identity. Use Sign out in navigation to leave this workspace.":
    "તમે અનામી બ્રાઉઝર ઓળખ વાપરી રહ્યા છો. આ કાર્યક્ષેત્ર છોડવા નેવિગેશનમાં સાઇન આઉટ પસંદ કરો.",
  "Go to your events": "તમારા કાર્યક્રમો પર જાઓ",
  "We couldn’t find that page.": "અમને તે પેજ મળ્યું નથી.",
  "The link may be incomplete. Return to your workspace or open an invitation from your organizer.":
    "લિંક અધૂરી હોઈ શકે છે. તમારા કાર્યક્ષેત્ર પર પાછા ફરો અથવા આયોજકનું આમંત્રણ ખોલો.",
  "Opening page": "પેજ ખુલી રહ્યું છે",
  "Loading your workspace": "તમારું કાર્યક્ષેત્ર લોડ થઈ રહ્યું છે",
  "This view isn’t available": "આ દૃશ્ય ઉપલબ્ધ નથી",
  "Try again": "ફરી પ્રયાસ કરો",
  "Close dialog": "સંવાદ બંધ કરો",
  "Retry original request": "મૂળ વિનંતી ફરી ચલાવો",
  "The application could not display this page. Reload to recover your session.":
    "એપ્લિકેશન આ પેજ બતાવી શકી નથી. તમારું સત્ર પુનઃપ્રાપ્ત કરવા રીલોડ કરો.",
  Live: "લાઇવ",
  Syncing: "સિંક થઈ રહ્યું છે",
  "Updates paused": "અપડેટ્સ રોકાયા છે",
  revision: "સુધારો",
  "Offline snapshot · revision {revision} · last synced {time}. Updates paused.":
    "ઑફલાઇન સ્નૅપશૉટ · સુધારો {revision} · છેલ્લું સિંક {time}. અપડેટ્સ રોકાયા છે.",
  never: "ક્યારેય નહીં",
  "Any countdown shown is an estimate from cached timing, not live coordination.":
    "બતાવાતી ઊલટી ગણતરી કૅશ કરેલા સમયનો અંદાજ છે, લાઇવ સંકલન નથી.",
  "Upcoming cue reminder": "આગામી સંકેત યાદગીરી",
  "{cue} starts in {minutes} {unit}.": "{cue} {minutes} {unit}માં શરૂ થશે.",
  minute: "મિનિટ",
  minutes: "મિનિટ",
  "Check that {speaker} is ready.": "ખાતરી કરો કે {speaker} તૈયાર છે.",
  "Check that your host is ready.": "ખાતરી કરો કે તમારા સંચાલક તૈયાર છે.",
  "This is a timing reminder; shared readiness responses are not available yet.":
    "આ સમય યાદગીરી છે; સહિયારા તૈયારી પ્રતિસાદ હજી ઉપલબ્ધ નથી.",
  "Review recovery options": "પુનઃપ્રાપ્તિ વિકલ્પો જુઓ",
  "If they are not ready, tell the organizer before the cue starts.":
    "જો તેઓ તૈયાર ન હોય તો સંકેત શરૂ થાય તે પહેલાં આયોજકને કહો.",
  "Dismiss on this screen": "આ સ્ક્રીન પર દૂર કરો",
  "Live stage overview": "લાઇવ મંચ ઝાંખી",
  "ON STAGE": "મંચ પર",
  "Event host": "કાર્યક્રમ સંચાલક",
  "Stage standby": "મંચ પ્રતીક્ષા",
  Pronunciation: "ઉચ્ચારણ",
  "Assigned to the current cue": "વર્તમાન સંકેત માટે નિયુક્ત",
  "No speaker assigned": "કોઈ વક્તા નિયુક્ત નથી",
  "CURRENT ACTIVITY": "વર્તમાન પ્રવૃત્તિ",
  ACTIVE: "સક્રિય",
  COMPLETE: "પૂર્ણ",
  STANDBY: "પ્રતીક્ષા",
  "That’s a wrap.": "કાર્યક્રમ પૂર્ણ થયો.",
  "Ready when you are.": "તમે તૈયાર ત્યારે અમે તૈયાર.",
  "Between cues": "સંકેતો વચ્ચે",
  "{start}–{end} IST · actual start / forecast end":
    "{start}–{end} IST · વાસ્તવિક શરૂઆત / અનુમાનિત અંત",
  "Review and publish your agenda to begin.":
    "શરૂ કરવા તમારી કાર્યસૂચિ તપાસી પ્રકાશિત કરો.",
  "Waiting for the next cue.": "આગલા સંકેતની રાહ છે.",
  "Planned window:": "આયોજિત સમય:",
  "UP NEXT": "આગળ",
  "Nothing further scheduled": "આગળ કંઈ નિર્ધારિત નથી",
  "PAST FORECAST END": "અનુમાનિત અંત પસાર",
  "TIME REMAINING": "બાકી સમય",
  "Scenario clock · advances manually": "પરિદૃશ્ય ઘડિયાળ · જાતે આગળ વધે છે",
  "Offline estimate · updates paused": "ઑફલાઇન અંદાજ · અપડેટ્સ રોકાયા છે",
  "Synced to the server clock": "સર્વર ઘડિયાળ સાથે સિંક",
  "Projected finish": "અનુમાનિત સમાપ્તિ",
  "Hard finish": "ફરજિયાત સમાપ્તિ",
  "Repair preview": "પુનઃપ્રાપ્તિ પૂર્વાવલોકન",
  Feasible: "શક્ય",
  "No feasible plan": "કોઈ શક્ય યોજના નથી",
  Recovered: "પુનઃપ્રાપ્ત",
  "(restored time)": "(સમય પાછો મળ્યો)",
  "Weighted shortening cost": "ભારિત ટૂંકાવવાની કિંમત",
  "Recovery comparison": "પુનઃપ્રાપ્તિ સરખામણી",
  "Original and proposed intervals for pending cues":
    "બાકી સંકેતોના મૂળ અને પ્રસ્તાવિત સમયગાળા",
  Cue: "સંકેત",
  Now: "હમણાં",
  Proposed: "પ્રસ્તાવિત",
  Minutes: "મિનિટ",
  unchanged: "અપરિવર્તિત",
  "Hard-rule checks": "ફરજિયાત નિયમ ચકાસણી",
  pass: "પાસ",
  fail: "નિષ્ફળ",
  "Minimum durations respected": "ન્યૂનતમ સમય સુરક્ષિત",
  "Fixed start protected": "નિશ્ચિત શરૂઆત સુરક્ષિત",
  "Hard finish protected": "ફરજિયાત અંત સુરક્ષિત",
  "Buffer before cue respected": "સંકેત પહેલાંનો વિરામ સુરક્ષિત",
  "Speaker release time respected": "વક્તા ઉપલબ્ધતા સમય સુરક્ષિત",
  "No overlapping cues": "સંકેતો એકબીજા પર આવતાં નથી",
  "Plan covers every pending cue": "યોજનામાં દરેક બાકી સંકેત સામેલ છે",
  "Completed cues untouched": "પૂર્ણ સંકેતો અપરિવર્તિત",
  "Active cue untouched": "સક્રિય સંકેત અપરિવર્તિત",
  "Whole minutes only": "માત્ર પૂર્ણ મિનિટ",
  "This preview expires at {time} (ten real minutes). The published plan has not changed.":
    "આ પૂર્વાવલોકન {time}એ સમાપ્ત થશે (દસ વાસ્તવિક મિનિટ). પ્રકાશિત યોજના બદલાઈ નથી.",
  "Publishing…": "પ્રકાશિત થઈ રહ્યું છે…",
  "Approve and publish": "મંજૂર કરીને પ્રકાશિત કરો",
  "Discard preview": "પૂર્વાવલોકન દૂર કરો",
  "This preview has expired. Discard it and calculate a new plan.":
    "આ પૂર્વાવલોકન સમાપ્ત થયું છે. તેને દૂર કરી નવી યોજના ગણો.",
  "Publishing is disabled because no plan satisfies every rule. CuePilot will not relax a rule on its own.":
    "પ્રકાશન બંધ છે કારણ કે કોઈ યોજના દરેક નિયમ પૂરો કરતી નથી. CuePilot જાતે કોઈ નિયમ ઢીલો નહીં કરે.",
  "Review draft": "ડ્રાફ્ટ તપાસો",
  "AI draft": "AI ડ્રાફ્ટ",
  Template: "ટેમ્પલેટ",
  "Schema checked": "સ્કીમા તપાસ્યું",
  missing: "ગુમ",
  "Referenced facts found ({count})": "સંદર્ભિત તથ્યો મળ્યા ({count})",
  pending: "બાકી",
  "Human review": "માનવીય સમીક્ષા",
  edited: "સંપાદિત",
  unedited: "અસંપાદિત",
  "Warnings from validation": "ચકાસણી ચેતવણીઓ",
  "Draft copy (edit before approving if needed)":
    "ડ્રાફ્ટ નકલ (જરૂર હોય તો મંજૂરી પહેલાં સંપાદિત કરો)",
  "{count}/1500 characters": "{count}/1500 અક્ષરો",
  "— too long to approve": "— મંજૂરી માટે ખૂબ લાંબું",
  "Source facts the model was given": "મોડેલને આપેલા સ્રોત તથ્યો",
  used: "વપરાયેલ",
  unused: "ન વપરાયેલ",
  "server record": "સર્વર રેકોર્ડ",
  "This draft references a fact that is not in the snapshot. Do not approve it.":
    "આ ડ્રાફ્ટ એવા તથ્યનો સંદર્ભ આપે છે જે સ્નૅપશૉટમાં નથી. તેને મંજૂર ન કરો.",
  "A valid schema and resolvable fact references do not prove the copy is faithful to the facts. Read the draft against the sources before approving.":
    "માન્ય સ્કીમા અને ઉપલબ્ધ તથ્ય સંદર્ભ નકલ તથ્યો પ્રત્યે સાચી છે તે સાબિત કરતા નથી. મંજૂરી પહેલાં સ્રોતો સાથે તપાસો.",
  "I reviewed the words against the approved facts and checked the language.":
    "મેં મંજૂર તથ્યો સામે શબ્દો તપાસ્યા અને ભાષા ચકાસી.",
  "This draft has expired. Discard it and generate a new one.":
    "આ ડ્રાફ્ટ સમાપ્ત થયો છે. તેને દૂર કરી નવો બનાવો.",
  "Approving…": "મંજૂર થઈ રહ્યું છે…",
  "Approve and publish copy": "નકલ મંજૂર કરી પ્રકાશિત કરો",
  "Discard draft": "ડ્રાફ્ટ દૂર કરો",
  "A little preparation. A calmer stage.": "થોડી તૈયારી. વધુ શાંત મંચ.",
  "Your guide to operating an event with CuePilot.":
    "CuePilot સાથે કાર્યક્રમ ચલાવવા માટેની તમારી માર્ગદર્શિકા.",
  "From your first cue to your final applause":
    "પ્રથમ સંકેતથી અંતિમ તાળીઓ સુધી",
  "Set up your event": "તમારો કાર્યક્રમ સેટ કરો",
  "Choose rehearsal for a clock you control, or live for the actual server clock. Add up to 20 cues, speakers, pronunciation hints, and approved facts.":
    "તમારા નિયંત્રણની ઘડિયાળ માટે રિહર્સલ અથવા વાસ્તવિક સર્વર ઘડિયાળ માટે લાઇવ પસંદ કરો. વધુમાં વધુ 20 સંકેતો, વક્તાઓ, ઉચ્ચારણ સૂચનો અને મંજૂર તથ્યો ઉમેરો.",
  "Protect what matters": "મહત્વની બાબતો સુરક્ષિત રાખો",
  "Give cues preferred and minimum durations. Set fixed starts, speaker availability, buffers, and a hard finish. Save the draft, then validate and publish from the console.":
    "સંકેતો માટે પસંદગીનો અને ન્યૂનતમ સમય આપો. નિશ્ચિત શરૂઆત, વક્તાની ઉપલબ્ધતા, વિરામ અને ફરજિયાત અંત સેટ કરો. ડ્રાફ્ટ સાચવો, પછી કન્સોલમાંથી તપાસીને પ્રકાશિત કરો.",
  "Bring your anchor in": "તમારા સંચાલકને જોડો",
  "Create a single-use invitation and share it privately. Your anchor opens it in a separate browser profile. They receive the published runbook and acknowledge each revision.":
    "એક વખત વપરાતું આમંત્રણ બનાવો અને ખાનગી રીતે વહેંચો. તમારો સંચાલક તેને અલગ બ્રાઉઝર પ્રોફાઇલમાં ખોલે છે. તેમને પ્રકાશિત રનબુક મળે છે અને દરેક સંશોધનની પુષ્ટિ કરે છે.",
  "Respond to a delay": "વિલંબનો ઉકેલ લાવો",
  "Start cues in order. Report extra minutes or a later speaker release time. Preview the recovery, review the rule checks, and approve. An impossible plan stays unpublished.":
    "સંકેતો ક્રમમાં શરૂ કરો. વધારાની મિનિટો અથવા વક્તાની મોડી ઉપલબ્ધતા નોંધો. પુનઃપ્રાપ્તિ જુઓ, નિયમોની તપાસ કરો અને મંજૂર કરો. અશક્ય યોજના અપ્રકાશિત રહે છે.",
  "Keep a record": "રેકોર્ડ સાચવો",
  "Revision history preserves every published change. Print the anchor runbook as a dated reference. Old revisions are read-only.":
    "સંશોધન ઇતિહાસ દરેક પ્રકાશિત ફેરફાર સાચવે છે. તારીખવાળા સંદર્ભ તરીકે સંચાલક રનબુક પ્રિન્ટ કરો. જૂના સંશોધનો માત્ર વાંચી શકાય છે.",
  "What works in this build": "આ બિલ્ડમાં શું કાર્ય કરે છે",
  "Event drafts, deterministic schedule repair, publication, cue controls, rehearsal clocks, invitations, acknowledgments, revision history, deletion, and cached published runbooks are connected to the backend.":
    "કાર્યક્રમ ડ્રાફ્ટ, નિશ્ચિત શેડ્યૂલ પુનઃપ્રાપ્તિ, પ્રકાશન, સંકેત નિયંત્રણ, રિહર્સલ ઘડિયાળ, આમંત્રણ, પુષ્ટિ, સંશોધન ઇતિહાસ, કાઢી નાખવું અને કૅશ કરેલી પ્રકાશિત રનબુક બૅકએન્ડ સાથે જોડાયેલા છે.",
  "Script generation uses approved facts and requires your review before publication. If AI is unavailable, the backend returns a clearly labelled template. Announcements publish the exact words you enter and can be dismissed in a new revision.":
    "સ્ક્રિપ્ટ બનાવવામાં મંજૂર તથ્યો વપરાય છે અને પ્રકાશન પહેલાં તમારી સમીક્ષા જરૂરી છે. AI ઉપલબ્ધ ન હોય તો બૅકએન્ડ સ્પષ્ટ લેબલવાળું ટેમ્પલેટ આપે છે. જાહેરાતો તમે દાખલ કરેલા ચોક્કસ શબ્દો પ્રકાશિત કરે છે અને નવા સંશોધનમાં દૂર કરી શકાય છે.",
  "Your session and event data": "તમારું સત્ર અને કાર્યક્રમ ડેટા",
  "Firebase provides an anonymous identity in this browser. There is no password, recovery email, or permanent account. Signing out or clearing browser storage loses access to events this identity owns.":
    "Firebase આ બ્રાઉઝરમાં અનામ ઓળખ આપે છે. કોઈ પાસવર્ડ, પુનઃપ્રાપ્તિ ઈમેલ અથવા કાયમી ખાતું નથી. સાઇન આઉટ કરવાથી અથવા બ્રાઉઝર સ્ટોરેજ સાફ કરવાથી આ ઓળખના કાર્યક્રમોની ઍક્સેસ ગુમાશે.",
  "Events expire after 72 hours. The demo permits two event creations per identity per day plus a shared project cap. Workspace shortcuts are saved only on this browser; they are not an account-wide event list.":
    "કાર્યક્રમો 72 કલાક પછી સમાપ્ત થાય છે. ડેમો દરેક ઓળખને દરરોજ બે કાર્યક્રમ બનાવવા દે છે અને સહિયારી પ્રોજેક્ટ મર્યાદા પણ છે. કાર્યક્ષેત્ર શૉર્ટકટ માત્ર આ બ્રાઉઝરમાં સચવાય છે; તે ખાતાની સંપૂર્ણ કાર્યક્રમ સૂચિ નથી.",
  "The latest published snapshot is stored locally for read-only network recovery. Offline status always includes a revision and last-sync time. A cold offline page load is not guaranteed. Sign-out and event deletion clear local snapshots.":
    "નવીનતમ પ્રકાશિત સ્નૅપશૉટ માત્ર વાંચી શકાય તેવી નેટવર્ક પુનઃપ્રાપ્તિ માટે સ્થાનિક રીતે સચવાય છે. ઑફલાઇન સ્થિતિમાં હંમેશા સંશોધન અને છેલ્લો સિંક સમય હોય છે. પ્રથમ ઑફલાઇન પેજ લોડની ખાતરી નથી. સાઇન આઉટ અને કાર્યક્રમ કાઢવાથી સ્થાનિક સ્નૅપશૉટ સાફ થાય છે.",
  "Stage operating limits": "મંચ સંચાલન મર્યાદાઓ",
  "One stage, fixed cue order, whole-minute scheduling, and an event of up to four hours. Structural agenda edits are draft-only. Acknowledgment means the anchor received a revision; it does not mean the words were spoken.":
    "એક મંચ, નિશ્ચિત સંકેત ક્રમ, પૂર્ણ મિનિટમાં શેડ્યૂલિંગ અને વધુમાં વધુ ચાર કલાકનો કાર્યક્રમ. કાર્યસૂચિના માળખાકીય ફેરફાર માત્ર ડ્રાફ્ટમાં થાય છે. પુષ્ટિનો અર્થ સંચાલકને સંશોધન મળ્યું; શબ્દો બોલાયા તેનો અર્થ નથી.",
  "Times display in Asia/Kolkata (IST). The interface is available in English, Hindi, and Gujarati; approved script language follows the metadata supplied by the backend.":
    "સમય Asia/Kolkata (IST)માં દેખાય છે. ઇન્ટરફેસ અંગ્રેજી, હિન્દી અને ગુજરાતીમાં ઉપલબ્ધ છે; મંજૂર સ્ક્રિપ્ટની ભાષા બૅકએન્ડના મેટાડેટા મુજબ હોય છે.",
  "This invitation is incomplete": "આ આમંત્રણ અધૂરું છે",
  "This invitation could not be accepted": "આ આમંત્રણ સ્વીકારી શકાયું નથી",
  "Connecting you to the stage": "તમને મંચ સાથે જોડવામાં આવી રહ્યા છે",
  "The link has no invitation code. Ask your organizer for a new link.":
    "આ લિંકમાં આમંત્રણ કોડ નથી. તમારા આયોજક પાસેથી નવી લિંક માગો.",
  "Accepting your private invitation…":
    "તમારું ખાનગી આમંત્રણ સ્વીકારવામાં આવી રહ્યું છે…",
  "Invitations are single-use and expire after one hour. Your organizer can create a new invitation.":
    "આમંત્રણ એક વખત વાપરી શકાય છે અને એક કલાક પછી સમાપ્ત થાય છે. તમારા આયોજક નવું આમંત્રણ બનાવી શકે છે.",
  "Back to your events": "તમારા કાર્યક્રમો પર પાછા જાઓ",
  "Waiting for the organizer to publish the runbook.":
    "આયોજક રનબુક પ્રકાશિત કરે તેની રાહ છે.",
  "Loading the published runbook…": "પ્રકાશિત રનબુક લોડ થઈ રહી છે…",
  "Retry connection": "કનેક્શન ફરી અજમાવો",
  "Back to events": "કાર્યક્રમો પર પાછા જાઓ",
  "Runbook loaded, revision {revision}.": "રનબુક લોડ થઈ, સંશોધન {revision}.",
  "Updated: revision {revision} published.":
    "અપડેટ: સંશોધન {revision} પ્રકાશિત થયું.",
  "ANCHOR RUNBOOK": "સંચાલક રનબુક",
  "Refresh runbook": "રનબુક રિફ્રેશ કરો",
  "Print runbook": "રનબુક પ્રિન્ટ કરો",
  "Toggle fullscreen": "પૂર્ણસ્ક્રીન બદલો",
  "Fullscreen is unavailable in this browser.":
    "આ બ્રાઉઝરમાં પૂર્ણસ્ક્રીન ઉપલબ્ધ નથી.",
  "Organizer preview. Only an invited anchor can acknowledge this runbook.":
    "આયોજક પૂર્વાવલોકન. માત્ર આમંત્રિત સંચાલક આ રનબુકની પુષ્ટિ કરી શકે છે.",
  "Return to console": "કન્સોલ પર પાછા ફરો",
  "Schedule needs repair": "શેડ્યૂલમાં સુધારો જરૂરી છે",
  "Cached copy": "કૅશ કરેલી નકલ",
  "Approved script": "મંજૂર સ્ક્રિપ્ટ",
  "No approved copy for this cue yet. The organizer drafts and approves host copy from the Scripts page; it appears here once approved.":
    "આ સંકેત માટે હજી મંજૂર નકલ નથી. આયોજક સ્ક્રિપ્ટ પેજ પરથી સંચાલક નકલ બનાવી મંજૂર કરે છે; મંજૂરી પછી તે અહીં દેખાય છે.",
  "AI-generated copy · reviewed and approved":
    "AI-બનાવેલી નકલ · સમીક્ષા અને મંજૂરી પૂર્ણ",
  "Human-written copy": "માનવ-લખેલી નકલ",
  Announcement: "જાહેરાત",
  "Acknowledging…": "પુષ્ટિ થઈ રહી છે…",
  "Acknowledged revision {revision}": "સંશોધન {revision}ની પુષ્ટિ થઈ",
  "Acknowledge revision {revision}": "સંશોધન {revision}ની પુષ્ટિ કરો",
  "Behind: you acknowledged revision {revision}":
    "પાછળ છો: તમે સંશોધન {revision}ની પુષ્ટિ કરી",
  "Acknowledgement confirms you received this revision. It does not confirm the words have been spoken.":
    "પુષ્ટિ જણાવે છે કે તમને આ સંશોધન મળ્યું. તે શબ્દો બોલાયા હોવાની પુષ્ટિ નથી.",
  "Complete published agenda": "પૂર્ણ પ્રકાશિત કાર્યસૂચિ",
  "All approved host copy": "બધી મંજૂર સંચાલક નકલો",
  "Speaker pronunciation & facts": "વક્તા ઉચ્ચારણ અને તથ્યો",
  "Approved {time}": "{time}એ મંજૂર",
  "Published revision {revision} · Last synced {time} · Times in IST. Printed copies do not update.":
    "પ્રકાશિત સંશોધન {revision} · છેલ્લો સિંક {time} · સમય ISTમાં. પ્રિન્ટ કરેલી નકલો અપડેટ થતી નથી.",
  "not synced": "સિંક થયું નથી",
  "A clear plan. A connected team. A stage under control.":
    "સ્પષ્ટ યોજના. જોડાયેલી ટીમ. નિયંત્રણમાં મંચ.",
  "Join an event": "કાર્યક્રમમાં જોડાઓ",
  "Try fictional rehearsal": "કાલ્પનિક રિહર્સલ અજમાવો",
  "Create event": "કાર્યક્રમ બનાવો",
  "YOUR STAGE, IN SYNC": "તમારો મંચ, તાલમેલમાં",
  "Keep the show moving together.": "કાર્યક્રમને સાથે આગળ વધારો.",
  "Prepare your rundown, protect your timing, and keep your anchor on the same page.":
    "તમારી રૂપરેખા તૈયાર કરો, સમય સુરક્ષિત રાખો અને સંચાલકને સમાન માહિતી પર રાખો.",
  "Explore the workflow": "કાર્યપ્રવાહ જુઓ",
  "Workflow: prepare, publish, perform":
    "કાર્યપ્રવાહ: તૈયાર કરો, પ્રકાશિત કરો, રજૂ કરો",
  Prepare: "તૈયાર કરો",
  "Every cue in its place": "દરેક સંકેત પોતાની જગ્યાએ",
  Publish: "પ્રકાશિત કરો",
  "One approved runbook": "એક મંજૂર રનબુક",
  Perform: "રજૂ કરો",
  "Everyone on the same cue": "દરેક વ્યક્તિ સમાન સંકેત પર",
  "Filter events": "કાર્યક્રમો ફિલ્ટર કરો",
  "All events": "બધા કાર્યક્રમો",
  Drafts: "ડ્રાફ્ટ",
  Running: "ચાલુ",
  Joined: "જોડાયેલા",
  "Search events": "કાર્યક્રમો શોધો",
  "Search your events…": "તમારા કાર્યક્રમો શોધો…",
  "{count} event in this browser": "આ બ્રાઉઝરમાં {count} કાર્યક્રમ",
  "{count} events in this browser": "આ બ્રાઉઝરમાં {count} કાર્યક્રમો",
  "Checking latest status…": "નવીનતમ સ્થિતિ તપાસાઈ રહી છે…",
  "Some events could not be refreshed":
    "કેટલાક કાર્યક્રમો રિફ્રેશ થઈ શક્યા નથી",
  "Status checked when this page opened": "પેજ ખૂલ્યું ત્યારે સ્થિતિ તપાસાઈ",
  "No matching events": "મેળ ખાતા કાર્યક્રમો નથી",
  "Your next event starts here": "તમારો આગળનો કાર્યક્રમ અહીંથી શરૂ થાય છે",
  "Try a different search or filter to find your event.":
    "તમારો કાર્યક્રમ શોધવા બીજી શોધ અથવા ફિલ્ટર અજમાવો.",
  "Create an event to build your agenda, or join your organizer’s invitation.":
    "કાર્યસૂચિ બનાવવા કાર્યક્રમ બનાવો અથવા આયોજકના આમંત્રણથી જોડાઓ.",
  "Clear filters": "ફિલ્ટર સાફ કરો",
  Checking: "તપાસ ચાલુ",
  Anchor: "સંચાલક",
  Unavailable: "અનુપલબ્ધ",
  "Waiting for publication": "પ્રકાશનની રાહ",
  "Saved event shortcut": "સાચવેલો કાર્યક્રમ શૉર્ટકટ",
  "{count} cues": "{count} સંકેતો",
  "{count} min": "{count} મિનિટ",
  Rehearsal: "રિહર્સલ",
  "Live mode": "લાઇવ મોડ",
  Organizer: "આયોજક",
  Unpublished: "અપ્રકાશિત",
  "Published R{revision}": "પ્રકાશિત R{revision}",
  "Open event": "કાર્યક્રમ ખોલો",
  "Remove shortcut": "શૉર્ટકટ દૂર કરો",
  "Already have an event ID?": "શું તમારી પાસે કાર્યક્રમ ID પહેલેથી છે?",
  "Open an event this identity owns or has joined.":
    "આ ઓળખની માલિકીનો અથવા જોડાયેલો કાર્યક્રમ ખોલો.",
  "Event ID": "કાર્યક્રમ ID",
  "Paste event ID": "કાર્યક્રમ ID પેસ્ટ કરો",
  "Opening…": "ખોલાઈ રહ્યું છે…",
  "Browser-local workspace · Anonymous identity · Events expire after 72 hours":
    "બ્રાઉઝર-સ્થાનિક કાર્યક્ષેત્ર · અનામ ઓળખ · કાર્યક્રમો 72 કલાક પછી સમાપ્ત થાય છે",
  "Try the fictional rehearsal?": "કાલ્પનિક રિહર્સલ અજમાવશો?",
  "Creates a personal, labeled rehearsal event seeded with the committed six-cue scenario.":
    "મંજૂર છ-સંકેત પરિદૃશ્યથી ભરેલો તમારો વ્યક્તિગત અને સ્પષ્ટ લેબલવાળો રિહર્સલ કાર્યક્રમ બનાવે છે.",
  "Opening → keynote → Q&A → community interaction → sponsor fixed at 10:45 → closing at 11:00. Every speaker, fact and event detail is fictional, and the scenario clock is controlled by you.":
    "ઉદ્ઘાટન → મુખ્ય ભાષણ → પ્રશ્નોત્તરી → સમુદાય સંવાદ → પ્રાયોજક 10:45એ નિશ્ચિત → સમાપન 11:00એ. દરેક વક્તા, તથ્ય અને કાર્યક્રમ વિગત કાલ્પનિક છે અને પરિદૃશ્ય ઘડિયાળ તમારા નિયંત્રણમાં છે.",
  "REHEARSAL · fictional event and speakers · scenario clock.":
    "રિહર્સલ · કાલ્પનિક કાર્યક્રમ અને વક્તાઓ · પરિદૃશ્ય ઘડિયાળ.",
  Cancel: "રદ કરો",
  "Creating…": "બનાવવામાં આવી રહ્યું છે…",
  "Create rehearsal": "રિહર્સલ બનાવો",
  "Create your event": "તમારો કાર્યક્રમ બનાવો",
  "Start with a blank agenda. You can load the fictional scenario in rehearsal setup.":
    "ખાલી કાર્યસૂચિથી શરૂ કરો. રિહર્સલ સેટઅપમાં કાલ્પનિક પરિદૃશ્ય લોડ કરી શકાય છે.",
  "Event name": "કાર્યક્રમનું નામ",
  "e.g. Campus innovation summit": "દા.ત. કેમ્પસ નવીનતા સંમેલન",
  "Start date & time (IST)": "શરૂઆતની તારીખ અને સમય (IST)",
  "Hard finish, minutes after start": "ફરજિયાત અંત, શરૂઆત પછીની મિનિટો",
  "Event mode": "કાર્યક્રમ મોડ",
  "Rehearsal · manual scenario clock": "રિહર્સલ · જાતે ચાલતી પરિદૃશ્ય ઘડિયાળ",
  "Live · actual server clock": "લાઇવ · વાસ્તવિક સર્વર ઘડિયાળ",
  "Mode cannot change after creation. Demo data expires after 72 hours. Maximum two creations per identity per day; shared capacity also applies.":
    "બનાવ્યા પછી મોડ બદલી શકાતો નથી. ડેમો ડેટા 72 કલાક પછી સમાપ્ત થાય છે. દરેક ઓળખ દરરોજ વધુમાં વધુ બે કાર્યક્રમ બનાવી શકે છે; સહિયારી ક્ષમતા મર્યાદા પણ લાગુ પડે છે.",
  "Keep this browser session. Signing out or clearing browser storage loses access to your events.":
    "આ બ્રાઉઝર સત્ર જાળવો. સાઇન આઉટ કરવાથી અથવા બ્રાઉઝર સ્ટોરેજ સાફ કરવાથી કાર્યક્રમોની ઍક્સેસ ગુમાશે.",
  "Join as an anchor": "સંચાલક તરીકે જોડાઓ",
  "Use the private invitation link your organizer shared with you.":
    "આયોજકે તમારી સાથે વહેંચેલી ખાનગી આમંત્રણ લિંક વાપરો.",
  "Invitation link": "આમંત્રણ લિંક",
  "Invitations are single-use and expire after one hour.":
    "આમંત્રણ એક વખત વપરાય છે અને એક કલાક પછી સમાપ્ત થાય છે.",
  "Open invitation": "આમંત્રણ ખોલો",
  "Enter an event name, a start time, and a duration from 1 to 240 minutes.":
    "કાર્યક્રમનું નામ, શરૂઆતનો સમય અને 1થી 240 મિનિટનો સમયગાળો દાખલ કરો.",
  "Choose a valid event start time.": "કાર્યક્રમનો માન્ય શરૂઆત સમય પસંદ કરો.",
  "Paste the complete invitation link, including its code.":
    "કોડ સહિત સંપૂર્ણ આમંત્રણ લિંક પેસ્ટ કરો.",
  "Enter a valid event ID.": "માન્ય કાર્યક્રમ ID દાખલ કરો.",
  draft: "ડ્રાફ્ટ",
  running: "ચાલુ",
  ended: "સમાપ્ત",
  completed: "પૂર્ણ",
  "Event complete": "કાર્યક્રમ પૂર્ણ",
  "Rehearsal in progress": "રિહર્સલ ચાલુ",
  "Rehearsal · scenario clock": "રિહર્સલ · પરિદૃશ્ય ઘડિયાળ",
  "Running now": "હમણાં ચાલુ",
  "Starts in {time}": "{time}માં શરૂ થશે",
  "Scheduled start reached · unpublished": "નિર્ધારિત શરૂઆત આવી · અપ્રકાશિત",
  "Approved facts, pronunciation, and the cues each person is part of.":
    "મંજૂર તથ્યો, ઉચ્ચારણ અને દરેક વ્યક્તિ જે સંકેતોનો ભાગ છે.",
  "Reviewed host copy, tied to your event’s approved facts.":
    "સમીક્ષા કરેલી સંચાલક નકલ, તમારા કાર્યક્રમના મંજૂર તથ્યો સાથે જોડાયેલી.",
  "Published messages shared with your anchor.":
    "તમારા સંચાલક સાથે વહેંચાયેલા પ્રકાશિત સંદેશા.",
  "An immutable record of changes to the event.":
    "કાર્યક્રમના ફેરફારોનો અપરિવર્તનીય રેકોર્ડ.",
  "Event details, retention, and workspace controls.":
    "કાર્યક્રમ વિગતો, જાળવણી અને કાર્યક્ષેત્ર નિયંત્રણો.",
  "Loading {page}": "{page} લોડ થઈ રહ્યું છે",
  "The server did not return an event.": "સર્વરે કાર્યક્રમ પરત આપ્યો નથી.",
  "Revision {revision}": "સંશોધન {revision}",
  "Refresh page": "પેજ રિફ્રેશ કરો",
  "Search speakers": "વક્તાઓ શોધો",
  "Find a speaker…": "વક્તા શોધો…",
  "Edit speakers": "વક્તાઓ સંપાદિત કરો",
  "Facts locked after publication": "પ્રકાશન પછી તથ્યો લૉક છે",
  "No matching speakers": "મેળ ખાતા વક્તા નથી",
  "No speakers added yet": "હજી કોઈ વક્તા ઉમેર્યા નથી",
  "Try another name.": "બીજું નામ અજમાવો.",
  "Add speakers and approved facts in event setup.":
    "કાર્યક્રમ સેટઅપમાં વક્તાઓ અને મંજૂર તથ્યો ઉમેરો.",
  "No pronunciation hint added": "ઉચ્ચારણ સૂચન ઉમેર્યું નથી",
  "Approved facts": "મંજૂર તથ્યો",
  "No approved facts yet.": "હજી મંજૂર તથ્યો નથી.",
  "Event facts": "કાર્યક્રમ તથ્યો",
  "Draft host copy from approved facts": "મંજૂર તથ્યોથી સંચાલક નકલ બનાવો",
  "The model only ever sees facts you approved, and it never sets a time. Every draft is reviewed by you before it reaches the stage.":
    "મોડેલ ફક્ત તમે મંજૂર કરેલા તથ્યો જુએ છે અને ક્યારેય સમય નક્કી કરતું નથી. મંચ સુધી પહોંચે તે પહેલાં દરેક ડ્રાફ્ટની તમે સમીક્ષા કરો છો.",
  "Generate a draft": "ડ્રાફ્ટ બનાવો",
  Kind: "પ્રકાર",
  Opening: "ઉદ્ઘાટન",
  "Speaker introduction": "વક્તા પરિચય",
  Transition: "પરિવર્તન",
  Closing: "સમાપન",
  Language: "ભાષા",
  "No specific cue": "કોઈ ચોક્કસ સંકેત નથી",
  "Drafting…": "ડ્રાફ્ટ બની રહ્યો છે…",
  "Generate draft": "ડ્રાફ્ટ બનાવો",
  "Hindi and Gujarati output is marked “generated; language quality unverified” until a qualified reviewer has read it.":
    "હિન્દી અને ગુજરાતી આઉટપુટને લાયક સમીક્ષક વાંચે ત્યાં સુધી “બનાવેલ; ભાષા ગુણવત્તા ચકાસેલી નથી” તરીકે ચિહ્નિત કરવામાં આવે છે.",
  "Approved host copy": "મંજૂર સંચાલક નકલ",
  "All languages": "બધી ભાષાઓ",
  "No approved scripts": "મંજૂર સ્ક્રિપ્ટ્સ નથી",
  "Generate a draft above, review it against your approved facts, then publish it to the anchor.":
    "ઉપર ડ્રાફ્ટ બનાવો, મંજૂર તથ્યો સામે તપાસો, પછી સંચાલક માટે પ્રકાશિત કરો.",
  "View source facts": "સ્રોત તથ્યો જુઓ",
  "Approved script & source facts": "મંજૂર સ્ક્રિપ્ટ અને સ્રોત તથ્યો",
  "Read-only provenance for the approved copy.":
    "મંજૂર નકલનો માત્ર વાંચી શકાય એવો સ્રોત ઇતિહાસ.",
  "Referenced facts": "સંદર્ભિત તથ્યો",
  "Referenced fact is not present in this snapshot.":
    "સંદર્ભિત તથ્ય આ સ્નૅપશૉટમાં નથી.",
  Source: "સ્રોત",
  Model: "મોડેલ",
  "Publish a message to your anchor": "તમારા સંચાલક માટે સંદેશ પ્રકાશિત કરો",
  "You write every word. Publishing is the approval step, and the message travels in the same published snapshot as the schedule.":
    "દરેક શબ્દ તમે લખો છો. પ્રકાશન જ મંજૂરીનું પગલું છે અને સંદેશ શેડ્યૂલના એ જ પ્રકાશિત સ્નૅપશૉટમાં જાય છે.",
  "New announcement": "નવી જાહેરાત",
  Message: "સંદેશ",
  "Type the exact words the anchor should see.":
    "સંચાલકે જોવા જોઈએ તે ચોક્કસ શબ્દો લખો.",
  "{count}/500 characters": "{count}/500 અક્ષરો",
  "Publish announcement": "જાહેરાત પ્રકાશિત કરો",
  "CuePilot never writes an announcement for you. There is no automatic emergency wording.":
    "CuePilot તમારા માટે જાહેરાત લખતું નથી. કોઈ આપોઆપ કટોકટી શબ્દાવલી નથી.",
  "Announcement filter": "જાહેરાત ફિલ્ટર",
  Active: "સક્રિય",
  "All messages": "બધા સંદેશા",
  "No announcements here": "અહીં કોઈ જાહેરાત નથી",
  "Published messages will be shown here and in the anchor runbook. No message has been sent.":
    "પ્રકાશિત સંદેશા અહીં અને સંચાલક રનબુકમાં દેખાશે. કોઈ સંદેશ મોકલાયો નથી.",
  Dismissed: "દૂર કરેલ",
  "Dismiss banner": "બૅનર દૂર કરો",
  "Retry history": "ઇતિહાસ ફરી લોડ કરો",
  "Loading revision history": "સંશોધન ઇતિહાસ લોડ થઈ રહ્યો છે",
  "No published revisions yet": "હજી પ્રકાશિત સંશોધનો નથી",
  "Save your draft and publish it from the stage console to create a runbook revision.":
    "રનબુક સંશોધન બનાવવા ડ્રાફ્ટ સાચવો અને મંચ કન્સોલમાંથી પ્રકાશિત કરો.",
  Revision: "સંશોધન",
  Change: "ફેરફાર",
  "Published at": "પ્રકાશન સમય",
  Actor: "કર્તા",
  Details: "વિગતો",
  "View revision {revision}": "સંશોધન {revision} જુઓ",
  "Loading…": "લોડ થઈ રહ્યું છે…",
  "Load older revisions": "જૂના સંશોધનો લોડ કરો",
  "Published snapshots are immutable. Restoring an old snapshot is not supported.":
    "પ્રકાશિત સ્નૅપશૉટ અપરિવર્તનીય છે. જૂનો સ્નૅપશૉટ પુનઃસ્થાપિત કરવાનું સમર્થિત નથી.",
  "Historical snapshot. This is not the current stage view.":
    "ઐતિહાસિક સ્નૅપશૉટ. આ વર્તમાન મંચ દૃશ્ય નથી.",
  "Loading revision": "સંશોધન લોડ થઈ રહ્યું છે",
  "Schedule valid": "શેડ્યૂલ માન્ય",
  "Needs repair": "સુધારો જરૂરી",
  "Updated {time}": "અપડેટ {time}",
  "Approved copy": "મંજૂર નકલ",
  "No approved scripts in this revision.": "આ સંશોધનમાં મંજૂર સ્ક્રિપ્ટ્સ નથી.",
  dismissed: "દૂર કરેલ",
  active: "સક્રિય",
  "No announcements in this revision.": "આ સંશોધનમાં જાહેરાતો નથી.",
  "Published agenda": "પ્રકાશિત કાર્યસૂચિ",
  "Time (IST)": "સમય (IST)",
  Speaker: "વક્તા",
  Status: "સ્થિતિ",
  "Event identity": "કાર્યક્રમ ઓળખ",
  Name: "નામ",
  Mode: "મોડ",
  Phase: "તબક્કો",
  Timezone: "સમય ક્ષેત્ર",
  "Data expires": "ડેટા સમાપ્તિ",
  "Event ID copied.": "કાર્યક્રમ ID કૉપી થઈ.",
  "Copy unavailable. Select the event ID above and copy it.":
    "કૉપી ઉપલબ્ધ નથી. ઉપર કાર્યક્રમ ID પસંદ કરી કૉપી કરો.",
  "Copy event ID": "કાર્યક્રમ ID કૉપી કરો",
  "Only this browser identity can manage the event. There is no permanent account or recovery flow. Invitations grant anchor access only.":
    "ફક્ત આ બ્રાઉઝર ઓળખ કાર્યક્રમ સંભાળી શકે છે. કોઈ કાયમી ખાતું અથવા પુનઃપ્રાપ્તિ પ્રક્રિયા નથી. આમંત્રણ માત્ર સંચાલક ઍક્સેસ આપે છે.",
  "Owner ID:": "માલિક ID:",
  "Delete event": "કાર્યક્રમ કાઢી નાખો",
  "This permanently removes the event, its runbook, revisions, and anchor access. Local shortcuts and snapshots are also cleared.":
    "આ કાર્યક્રમ, તેની રનબુક, સંશોધનો અને સંચાલક ઍક્સેસ કાયમ માટે દૂર કરે છે. સ્થાનિક શૉર્ટકટ અને સ્નૅપશૉટ પણ સાફ થાય છે.",
  "Permanently delete this event?": "આ કાર્યક્રમ કાયમ માટે કાઢી નાખશો?",
  "This cannot be undone. Anchors will lose access to the published runbook.":
    "આ પાછું ફેરવી શકાતું નથી. સંચાલકો પ્રકાશિત રનબુકની ઍક્સેસ ગુમાવશે.",
  "Type DELETE to confirm": "પુષ્ટિ માટે DELETE લખો",
  "The event is no longer available. A previous deletion may have succeeded.":
    "કાર્યક્રમ હવે ઉપલબ્ધ નથી. અગાઉ કાઢવાની ક્રિયા સફળ થઈ હોઈ શકે છે.",
  "Remove local copy": "સ્થાનિક નકલ દૂર કરો",
  "Refresh event before deleting": "કાઢતા પહેલાં કાર્યક્રમ રિફ્રેશ કરો",
  "Keep event": "કાર્યક્રમ રાખો",
  "Deleting…": "કાઢવામાં આવી રહ્યું છે…",
  "Delete permanently": "કાયમ માટે કાઢી નાખો",
  "Loading event setup": "કાર્યક્રમ સેટઅપ લોડ થઈ રહ્યું છે",
  "This agenda is published": "આ કાર્યસૂચિ પ્રકાશિત છે",
  "Structural changes and speaker fact editing are available only before publication.":
    "માળખાકીય ફેરફાર અને વક્તા તથ્ય સંપાદન માત્ર પ્રકાશન પહેલાં ઉપલબ્ધ છે.",
  "Return to stage console": "મંચ કન્સોલ પર પાછા ફરો",
  "Preferred duration": "પસંદગીનો સમય",
  "Minimum duration": "ન્યૂનતમ સમય",
  "Shortening priority": "ટૂંકાવવાની પ્રાથમિકતા",
  "Buffer before cue": "સંકેત પહેલાં વિરામ",
  "Available from minute": "આ મિનિટથી ઉપલબ્ધ",
  "Fixed start minute": "નિશ્ચિત શરૂઆત મિનિટ",
  "That file could not be read as text.":
    "તે ફાઇલ ટેક્સ્ટ તરીકે વાંચી શકાઈ નથી.",
  "Add at least one cue to your agenda.":
    "તમારી કાર્યસૂચિમાં ઓછામાં ઓછો એક સંકેત ઉમેરો.",
  "Approved fact {number}": "મંજૂર તથ્ય {number}",
  "Remove {prefix} fact {number}": "{prefix} તથ્ય {number} દૂર કરો",
  "Add approved fact": "મંજૂર તથ્ય ઉમેરો",
  "Build your agenda and define the commitments your schedule must protect.":
    "તમારી કાર્યસૂચિ બનાવો અને શેડ્યૂલને સુરક્ષિત રાખવાની પ્રતિબદ્ધતાઓ નક્કી કરો.",
  "Draft · revision {revision}": "ડ્રાફ્ટ · સંશોધન {revision}",
  "Setup sections": "સેટઅપ વિભાગો",
  "Agenda · {count}": "કાર્યસૂચિ · {count}",
  "Speakers & facts · {count}": "વક્તાઓ અને તથ્યો · {count}",
  "Event details": "કાર્યક્રમ વિગતો",
  "All times in IST": "બધા સમય ISTમાં",
  "Start date & time": "શરૂઆતની તારીખ અને સમય",
  "Hard finish (minutes after start)": "ફરજિયાત અંત (શરૂઆત પછીની મિનિટો)",
  "The hard finish is a protected commitment, not a suggested duration. Mode: {mode}.":
    "ફરજિયાત અંત સુરક્ષિત પ્રતિબદ્ધતા છે, સૂચવેલો સમયગાળો નથી. મોડ: {mode}.",
  "Approved event facts": "મંજૂર કાર્યક્રમ તથ્યો",
  "Keep names and context accurate. These facts are retained with their original IDs.":
    "નામ અને સંદર્ભ સાચા રાખો. આ તથ્યો તેમની મૂળ ID સાથે જળવાય છે.",
  "Try the fictional TechFest scenario": "કાલ્પનિક TechFest પરિદૃશ્ય અજમાવો",
  "Six cues, three fictional speakers, a fixed sponsor start, and a 60-minute finish.":
    "છ સંકેતો, ત્રણ કાલ્પનિક વક્તાઓ, પ્રાયોજકની નિશ્ચિત શરૂઆત અને 60 મિનિટમાં સમાપ્તિ.",
  "Load scenario": "પરિદૃશ્ય લોડ કરો",
  "Shape the running order": "કાર્યક્રમ ક્રમ બનાવો",
  "Times are whole-minute offsets from the event start. The server calculates the schedule when you save.":
    "સમય કાર્યક્રમની શરૂઆતથી પૂર્ણ મિનિટનો તફાવત છે. સાચવતી વખતે સર્વર શેડ્યૂલ ગણે છે.",
  "Import CSV": "CSV આયાત કરો",
  "Add cue": "સંકેત ઉમેરો",
  "Build your running order": "તમારો કાર્યક્રમ ક્રમ બનાવો",
  "Add your opening, sessions, transitions, and closing. You can reorder cues before publication.":
    "ઉદ્ઘાટન, સત્રો, પરિવર્તન અને સમાપન ઉમેરો. પ્રકાશન પહેલાં સંકેતોનો ક્રમ બદલી શકાય છે.",
  "CUE {number}": "સંકેત {number}",
  "Move cue {number} up": "સંકેત {number} ઉપર ખસેડો",
  "Move cue {number} down": "સંકેત {number} નીચે ખસેડો",
  "Remove cue {number}": "સંકેત {number} દૂર કરો",
  "Cue title": "સંકેત શીર્ષક",
  "No assigned speaker": "કોઈ વક્તા નિયુક્ત નથી",
  "Unnamed speaker": "નામ વગરના વક્તા",
  "Not set": "સેટ નથી",
  "Higher shortening priority protects this cue more strongly. Minimum duration must not exceed preferred duration.":
    "વધુ ટૂંકાવવાની પ્રાથમિકતા આ સંકેતને વધુ સુરક્ષિત રાખે છે. ન્યૂનતમ સમય પસંદગીના સમયથી વધુ ન હોવો જોઈએ.",
  "People behind the programme": "કાર્યક્રમ પાછળના લોકો",
  "Add pronunciation and approved facts for the host. Up to 20 speakers and ten facts per speaker.":
    "સંચાલક માટે ઉચ્ચારણ અને મંજૂર તથ્યો ઉમેરો. વધુમાં વધુ 20 વક્તાઓ અને દરેક વક્તા માટે દસ તથ્યો.",
  "Add speaker": "વક્તા ઉમેરો",
  "Put a name to each cue": "દરેક સંકેતને નામ આપો",
  "Add speakers, then assign them to cues in your agenda.":
    "વક્તાઓ ઉમેરો, પછી તેમને કાર્યસૂચિના સંકેતો સાથે જોડો.",
  "Speaker {number}": "વક્તા {number}",
  "Remove speaker {number}": "વક્તા {number} દૂર કરો",
  "Full name": "પૂરું નામ",
  "Pronunciation hint (optional)": "ઉચ્ચારણ સૂચન (વૈકલ્પિક)",
  "Unsaved changes": "ન સાચવેલા ફેરફારો",
  "Draft loaded": "ડ્રાફ્ટ લોડ થયો",
  "Saving does not publish": "સાચવવાથી પ્રકાશન થતું નથી",
  "Next section": "આગળનો વિભાગ",
  "Saving…": "સાચવાઈ રહ્યું છે…",
  "Save & review": "સાચવો અને સમીક્ષા કરો",
  "Check your draft before saving": "સાચવતા પહેલાં ડ્રાફ્ટ તપાસો",
  "Reload latest draft (discard edits)":
    "નવીનતમ ડ્રાફ્ટ ફરી લોડ કરો (સંપાદન દૂર કરો)",
  "Load the fictional scenario?": "કાલ્પનિક પરિદૃશ્ય લોડ કરશો?",
  "This replaces your unsaved agenda and speaker facts with the labelled TechFest rehearsal.":
    "આ તમારી ન સાચવેલી કાર્યસૂચિ અને વક્તા તથ્યોને લેબલવાળી TechFest રિહર્સલથી બદલે છે.",
  "Opening → keynote → Q&A → community → sponsor → closing. The sponsor is fixed at minute 45; hard finish is minute 60.":
    "ઉદ્ઘાટન → મુખ્ય ભાષણ → પ્રશ્નોત્તરી → સમુદાય → પ્રાયોજક → સમાપન. પ્રાયોજક 45મી મિનિટે અને ફરજિયાત અંત 60મી મિનિટે છે.",
  "Import an agenda from CSV": "CSVમાંથી કાર્યસૂચિ આયાત કરો",
  "Use the provided template, replace its example rows, then import. Imported cues are added to the current agenda and are not saved or published until you save the draft.":
    "આપેલું ટેમ્પલેટ વાપરો, ઉદાહરણ પંક્તિઓ બદલો અને આયાત કરો. આયાત કરેલા સંકેતો હાલની કાર્યસૂચિમાં ઉમેરાય છે અને ડ્રાફ્ટ સાચવો ત્યાં સુધી સાચવાતા કે પ્રકાશિત થતા નથી.",
  "Download template": "ટેમ્પલેટ ડાઉનલોડ કરો",
  "CSV file": "CSV ફાઇલ",
  "Selected: {file}": "પસંદ કરેલ: {file}",
  "Fix these rows before importing": "આયાત પહેલાં આ પંક્તિઓ સુધારો",
  "Import preview": "આયાત પૂર્વાવલોકન",
  "Cues that will be added to the agenda": "કાર્યસૂચિમાં ઉમેરાનારા સંકેતો",
  "Pref / min": "પસંદગી / ન્યૂનતમ",
  "No speaker": "કોઈ વક્તા નથી",
  "Add {count} cue": "{count} સંકેત ઉમેરો",
  "Add {count} cues": "{count} સંકેતો ઉમેરો",
  "Add cues": "સંકેતો ઉમેરો",
  "Leave your unsaved draft?": "ન સાચવેલો ડ્રાફ્ટ છોડશો?",
  "Your edits have not been saved to the event.":
    "તમારા સંપાદનો કાર્યક્રમમાં સાચવાયા નથી.",
  "Keep editing": "સંપાદન ચાલુ રાખો",
  "Discard & leave": "દૂર કરો અને બહાર નીકળો",
  "Organizer console": "આયોજક કન્સોલ",
  "Loading stage console": "મંચ કન્સોલ લોડ થઈ રહ્યું છે",
  "Back to start": "શરૂઆત પર પાછા જાઓ",
  "Stage console · Every cue and every change in one place.":
    "મંચ કન્સોલ · દરેક સંકેત અને દરેક ફેરફાર એક જગ્યાએ.",
  "Refresh console": "કન્સોલ રિફ્રેશ કરો",
  "revision {revision}": "સંશોધન {revision}",
  "Event clock": "કાર્યક્રમ ઘડિયાળ",
  "Cues completed": "પૂર્ણ સંકેતો",
  "Anchor handoff": "સંચાલક સોંપણી",
  Received: "પ્રાપ્ત",
  "Awaiting ack": "પુષ્ટિની રાહ",
  Reconnect: "ફરી જોડાઓ",
  "Waiting for the server to confirm this action…":
    "સર્વર આ ક્રિયાની પુષ્ટિ કરે તેની રાહ છે…",
  "Published runbook revision {revision}.": "રનબુક સંશોધન {revision} પ્રકાશિત.",
  "Draft runbook. Not yet published.": "ડ્રાફ્ટ રનબુક. હજી પ્રકાશિત નથી.",
  Agenda: "કાર્યસૂચિ",
  "Event agenda": "કાર્યક્રમ કાર્યસૂચિ",
  Planned: "આયોજિત",
  "Actual / forecast": "વાસ્તવિક / અનુમાનિત",
  Rules: "નિયમો",
  forecast: "અનુમાન",
  "rehearsal clock": "રિહર્સલ ઘડિયાળ",
  "server clock": "સર્વર ઘડિયાળ",
  "fixed {time}": "નિશ્ચિત {time}",
  "from {time}": "{time}થી",
  "buffer {minutes}": "વિરામ {minutes}",
  "No cues yet. Add the agenda on the setup screen before publishing.":
    "હજી કોઈ સંકેત નથી. પ્રકાશન પહેલાં સેટઅપ સ્ક્રીન પર કાર્યસૂચિ ઉમેરો.",
  "Seeded rehearsal": "પહેલેથી ભરેલી રિહર્સલ",
  "This is the labeled fictional TechFest scenario. The action below publishes it and advances the opening so the keynote is active, using the normal stage commands — the same buttons a person would click.":
    "આ લેબલવાળું કાલ્પનિક TechFest પરિદૃશ્ય છે. નીચેની ક્રિયા સામાન્ય મંચ કમાન્ડથી તેને પ્રકાશિત કરે છે અને ઉદ્ઘાટન આગળ વધારી મુખ્ય ભાષણ સક્રિય કરે છે—એ જ બટન જે વ્યક્તિ દબાવશે.",
  "Load rehearsal at keynote": "મુખ્ય ભાષણ પર રિહર્સલ લોડ કરો",
  "Publish the runbook": "રનબુક પ્રકાશિત કરો",
  "Publishing validates the full draft and makes it visible to anchors. It does not start the first cue.":
    "પ્રકાશન આખા ડ્રાફ્ટની તપાસ કરીને સંચાલકોને દેખાડે છે. તે પહેલો સંકેત શરૂ કરતું નથી.",
  "Edit agenda": "કાર્યસૂચિ સંપાદિત કરો",
  "Validate and publish": "તપાસો અને પ્રકાશિત કરો",
  "Run the stage": "મંચ ચલાવો",
  "No cues left": "કોઈ સંકેત બાકી નથી",
  "Start {cue}": "{cue} શરૂ કરો",
  "Complete {cue}": "{cue} પૂર્ણ કરો",
  "Scenario clock": "પરિદૃશ્ય ઘડિયાળ",
  "The scenario clock advances only forward. Actual times recorded while it is in use are labelled as rehearsal-clock times.":
    "પરિદૃશ્ય ઘડિયાળ ફક્ત આગળ વધે છે. તેના ઉપયોગ દરમિયાન નોંધાયેલા વાસ્તવિક સમય રિહર્સલ-ઘડિયાળ સમય તરીકે ચિહ્નિત થાય છે.",
  "+{minutes} min": "+{minutes} મિનિટ",
  "Report an overrun": "વધારાનો સમય નોંધો",
  "A repair can be previewed between cues as well; with no active cue the plan is rebuilt from the current scenario minute.":
    "સંકેતો વચ્ચે પણ પુનઃપ્રાપ્તિ જોઈ શકાય છે; સક્રિય સંકેત ન હોય ત્યારે યોજના વર્તમાન પરિદૃશ્ય મિનિટથી ફરી બને છે.",
  "{cue} currently forecasts {time}. Entering a delay sends a new absolute forecast end, so re-previewing never stacks the delay.":
    "{cue}નો વર્તમાન અંદાજ {time} છે. વિલંબ દાખલ કરવાથી નવી નિશ્ચિત અનુમાનિત સમાપ્તિ મોકલાય છે, તેથી ફરી પૂર્વાવલોકન કરવાથી વિલંબ ઉમેરાતો નથી.",
  "Delay in minutes": "વિલંબ, મિનિટોમાં",
  "New forecast end {time} ({minutes} min)":
    "નવી અનુમાનિત સમાપ્તિ {time} ({minutes} મિનિટ)",
  "Speaker arriving late?": "વક્તા મોડા આવી રહ્યા છે?",
  "Pending cue": "બાકી સંકેત",
  "No availability update": "ઉપલબ્ધતા અપડેટ નથી",
  "Available from minute after start": "શરૂઆત પછીની આ મિનિટથી ઉપલબ્ધ",
  "Calculating…": "ગણતરી થઈ રહી છે…",
  "Preview recovery plan": "પુનઃપ્રાપ્તિ યોજના જુઓ",
  "Published revision": "પ્રકાશિત સંશોધન",
  "not published": "પ્રકાશિત નથી",
  "No acknowledgements yet.": "હજી કોઈ પુષ્ટિ નથી.",
  current: "વર્તમાન",
  behind: "પાછળ",
  "revision {revision} at {time}": "સંશોધન {revision}, {time}એ",
  "Publication success and acknowledgement are separate: the anchor may not have seen this revision yet.":
    "સફળ પ્રકાશન અને પુષ્ટિ અલગ છે: સંચાલકે કદાચ આ સંશોધન હજી જોયું નથી.",
  "The anchor has acknowledged receiving this revision. That is not confirmation the words were spoken.":
    "સંચાલકે આ સંશોધન મળ્યાની પુષ્ટિ કરી છે. તે શબ્દો બોલાયાની પુષ્ટિ નથી.",
  "Invite an anchor": "સંચાલકને આમંત્રિત કરો",
  "Preview anchor view": "સંચાલક દૃશ્ય જુઓ",
  "Show invitation": "આમંત્રણ બતાવો",
  "Invite your anchor": "તમારા સંચાલકને આમંત્રિત કરો",
  "A private, single-use invitation. Valid for one hour.":
    "ખાનગી, એક વખત વપરાતું આમંત્રણ. એક કલાક માટે માન્ય.",
  "Single-use invitation, valid one hour. Shown once — copy it now.":
    "એક વખત વપરાતું આમંત્રણ, એક કલાક માટે માન્ય. એક વાર જ દેખાશે—હમણાં કૉપી કરો.",
  "Open it in a different browser profile or an incognito window: the same profile would join as you, the owner.":
    "તેને અલગ બ્રાઉઝર પ્રોફાઇલ અથવા છુપી વિન્ડોમાં ખોલો: એ જ પ્રોફાઇલ માલિક તરીકે જોડાશે.",
  "Invitation copied.": "આમંત્રણ કૉપી થયું.",
  "Copy unavailable. Select and copy the link above.":
    "કૉપી ઉપલબ્ધ નથી. ઉપરની લિંક પસંદ કરી કૉપી કરો.",
  "Copy invitation link": "આમંત્રણ લિંક કૉપી કરો",
  "Signed in as {uid}. Demo data expires {time}.":
    "{uid} તરીકે સાઇન ઇન. ડેમો ડેટા {time}એ સમાપ્ત થાય છે.",
  "Load rehearsal at keynote?": "મુખ્ય ભાષણ પર રિહર્સલ લોડ કરશો?",
  "Publishes the seeded draft and advances the opening so the keynote is active, using the normal stage commands only.":
    "પહેલેથી ભરેલો ડ્રાફ્ટ પ્રકાશિત કરે છે અને ફક્ત સામાન્ય મંચ કમાન્ડથી ઉદ્ઘાટન આગળ વધારી મુખ્ય ભાષણ સક્રિય કરે છે.",
  "The commands run in order — publish, start and complete the opening, advance the scenario clock to each published cue boundary, then start the keynote. No rule is bypassed and every step is an ordinary idempotent command.":
    "કમાન્ડ ક્રમમાં ચાલે છે—પ્રકાશિત કરવું, ઉદ્ઘાટન શરૂ અને પૂર્ણ કરવું, પરિદૃશ્ય ઘડિયાળને દરેક પ્રકાશિત સંકેત સીમા સુધી વધારવી, પછી મુખ્ય ભાષણ શરૂ કરવું. કોઈ નિયમ ટળતો નથી અને દરેક પગલું સામાન્ય પુનરાવર્તન-સુરક્ષિત કમાન્ડ છે.",
  "Publish the runbook?": "રનબુક પ્રકાશિત કરશો?",
  "This validates your draft and shares the approved agenda with your anchor. Direct agenda and fact editing closes after publication.":
    "આ તમારા ડ્રાફ્ટની તપાસ કરીને મંજૂર કાર્યસૂચિ સંચાલક સાથે વહેંચે છે. પ્રકાશન પછી સીધું કાર્યસૂચિ અને તથ્ય સંપાદન બંધ થાય છે.",
  "{count} cues · Hard finish {time} IST":
    "{count} સંકેતો · ફરજિયાત અંત {time} IST",
  "Keep reviewing": "સમીક્ષા ચાલુ રાખો",
  "Review the recovery plan": "પુનઃપ્રાપ્તિ યોજનાની સમીક્ષા કરો",
  "Check every timing change before publishing a new revision.":
    "નવું સંશોધન પ્રકાશિત કરતાં પહેલાં દરેક સમય ફેરફાર તપાસો.",
};

const dictionaries: Record<Exclude<UiLocale, "en">, Dictionary> = { hi, gu };

export const translate = (
  locale: UiLocale,
  source: string,
  variables: Variables = {},
): string => {
  const template =
    locale === "en" ? source : (dictionaries[locale][source] ?? source);
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(variables[key] ?? `{${key}}`),
  );
};

type I18nValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (source: string, variables?: Variables) => string;
};

const I18nContext = createContext<I18nValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (source, variables) => translate("en", source, variables),
});

const readLocale = (): UiLocale => {
  const saved = localStorage.getItem("cuepilot:ui-language");
  return locales.find((locale) => locale === saved) ?? "en";
};

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<UiLocale>(readLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("cuepilot:ui-language", locale);
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (source, variables) => translate(locale, source, variables),
    }),
    [locale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export const useI18n = (): I18nValue => {
  return useContext(I18nContext);
};
