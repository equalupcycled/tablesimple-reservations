(function(){var s=document.currentScript,slug=s.getAttribute('data-restaurant')||'demo',base=new URL(s.src).origin;
var f=document.createElement('iframe');f.src=base+'/book/'+slug+'?embed=1';f.title='Book a table';f.style.cssText='width:100%;border:0;min-height:520px;display:block';f.setAttribute('scrolling','no');
s.parentNode.insertBefore(f,s.nextSibling);
window.addEventListener('message',function(e){if(e.origin===base&&e.data&&e.data.type==='tablesimple:height'&&e.data.slug===slug)f.style.height=e.data.height+'px'});})();
