(function(){
  const capacitor=window.Capacitor;
  if(!capacitor?.isNativePlatform?.())return;
  const plugins=capacitor.Plugins||{};
  plugins.App?.addListener?.('backButton',()=>window.dispatchEvent(new Event('evenit:native-back')));
  plugins.Network?.getStatus?.().then(status=>window.dispatchEvent(new CustomEvent('evenit:network',{detail:status}))).catch(()=>{});
  plugins.Network?.addListener?.('networkStatusChange',status=>window.dispatchEvent(new CustomEvent('evenit:network',{detail:status})));
})();
