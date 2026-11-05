package com.anf.workspace;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

/** Real PackageManager/ShortcutManager acceptance, for a disposable installed QA app. */
public class EntryPointsTest {
  @Test public void installedEntryPointsRetainTheirIdentity() throws Exception {
    Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    String id=context.getPackageName();
    boolean legacy=id.equals("com.coucou.workspace") || id.equals("com.coucou.workspace.musicdev");
    assertTrue("Unexpected QA identity",legacy || id.equals("com.anf.workspace") || id.equals("com.anf.workspace.musicdev"));
    String launcher=(legacy?"com.coucou.workspace":"com.anf.workspace")+".MainActivity";
    String tile=(legacy?"com.coucou.workspace":"com.anf.workspace")+".QuickNoteTile";
    PackageManager pm=context.getPackageManager();
    Intent launch=pm.getLaunchIntentForPackage(id);
    assertNotNull("App has no launcher entry point",launch);
    assertEquals(new ComponentName(id,launcher),launch.getComponent());
    Intent entries=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(id);
    assertEquals("Duplicate launcher icons",1,pm.queryIntentActivities(entries,0).size());
    ServiceInfo service=pm.getServiceInfo(new ComponentName(id,tile),0);
    assertEquals("android.permission.BIND_QUICK_SETTINGS_TILE",service.permission);
    assertTrue(service.exported);
    String media=(legacy?"com.coucou.workspace":"com.anf.workspace")+".PlaybackService";
    assertFalse("Private media service became exported",pm.getServiceInfo(new ComponentName(id,media),0).exported);
    List<ShortcutInfo> shortcuts=context.getSystemService(ShortcutManager.class).getManifestShortcuts();
    ShortcutInfo quick=null;
    for(ShortcutInfo item:shortcuts)if(item.getId().equals("quick_note"))quick=item;
    assertNotNull("Quick-note shortcut was not published by the launcher",quick);
    assertEquals(new ComponentName(id,launcher),quick.getActivity());
    Intent intent=quick.getIntent();assertNotNull(intent);assertNotNull(intent.getComponent());
    assertEquals(new ComponentName(id,launcher),intent.getComponent());
    assertTrue("Unexpected quick-note action","com.anf.QUICK_NOTE".equals(intent.getAction()) || "com.coucou.QUICK_NOTE".equals(intent.getAction()));
  }
}
