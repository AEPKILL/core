import { IRPCProtocol } from '@ali/ide-connection';
import { Injectable, Autowired, Optinal } from '@ali/common-di';
import { TreeViewItem, TreeViewBaseOptions } from '../../../common/vscode';
import { TreeItemCollapsibleState, ICommand } from '../../../common/vscode/ext-types';
import { IMainThreadTreeView, IExtHostTreeView, ExtHostAPIIdentifier } from '../../../common/vscode';
import { TreeNode, MenuPath, Emitter, DisposableStore, toDisposable } from '@ali/ide-core-browser';
import { IMainLayoutService } from '@ali/ide-main-layout';
import { ExtensionTabbarTreeView } from '../../components';
import { IIconService, IconType } from '@ali/ide-theme';
import { SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode } from '@ali/ide-core-browser';

export const VIEW_ITEM_CONTEXT_MENU: MenuPath = ['view-item-context-menu'];
export const VIEW_ITEM_INLINE_MNUE: MenuPath = ['view-item-inline-menu'];

export interface CompositeTreeViewNode extends TreeViewNode, ExpandableTreeNode, CompositeTreeNode {
}

export interface TreeViewNode extends SelectableTreeNode {
  contextValue?: string;
  command?: ICommand;
}

@Injectable({multiple: true})
export class MainThreadTreeView implements IMainThreadTreeView {
  private readonly proxy: IExtHostTreeView;

  @Autowired(IMainLayoutService)
  private readonly mainLayoutService: IMainLayoutService;

  @Autowired(IIconService)
  private readonly iconService: IIconService;

  readonly dataProviders: Map<string, TreeViewDataProviderMain> = new Map<string, TreeViewDataProviderMain>();

  private disposableCollection: Map<string, DisposableStore> = new Map();
  private disposable: DisposableStore = new DisposableStore();

  constructor(@Optinal(IRPCProtocol) private rpcProtocol: IRPCProtocol) {
    this.proxy = this.rpcProtocol.getProxy(ExtHostAPIIdentifier.ExtHostTreeView);
    this.disposable.add(toDisposable(() => this.dataProviders.clear()));
  }

  dispose() {
    this.disposable.dispose();
  }

  $registerTreeDataProvider(treeViewId: string, options: TreeViewBaseOptions): void {
    if (!this.dataProviders.has(treeViewId)) {
      const disposable = new DisposableStore();
      const dataProvider = new TreeViewDataProviderMain(treeViewId, this.proxy, this.iconService);
      this.dataProviders.set(treeViewId, dataProvider);
      disposable.add(toDisposable(() => this.dataProviders.delete(treeViewId)));
      this.mainLayoutService.replaceViewComponent({
        id: treeViewId,
        component: ExtensionTabbarTreeView,
      }, {
        dataProvider: this.dataProviders.get(treeViewId),
        viewId: treeViewId,
        options,
      });
      const handler = this.mainLayoutService.getTabbarHandler(treeViewId);
      if (handler) {
        handler.onActivate(() => {
          dataProvider.setVisible(treeViewId, true);
        });
        handler.onInActivate(() => {
          dataProvider.setVisible(treeViewId, false);
        });
        disposable.add(toDisposable(() => handler.disposeView(treeViewId)));
      }
      this.disposableCollection.set(treeViewId, disposable);
    }
  }

  $unregisterTreeDataProvider(treeViewId: string) {
    const disposable = this.disposableCollection.get(treeViewId);
    if (disposable) {
      disposable.dispose();
    }
  }

  $refresh(treeViewId: string, itemsToRefresh?: TreeViewItem) {
    const dataProvider = this.dataProviders.get(treeViewId);
    if (dataProvider) {
      dataProvider.refresh(itemsToRefresh);
    }
  }

  async $reveal(treeViewId: string, treeItemId: string) {
    const dataProvider = this.dataProviders.get(treeViewId);
    if (dataProvider) {
      dataProvider.reveal(treeItemId);
    }
  }
}

export class TreeViewDataProviderMain {

  private onTreeDataChangedEmitter = new Emitter<any>();
  private onRevealEventEmitter = new Emitter<any>();

  get onTreeDataChanged() {
    return this.onTreeDataChangedEmitter.event;
  }

  get onRevealEvent() {
    return this.onRevealEventEmitter.event;
  }

  constructor(
    private treeViewId: string,
    private proxy: IExtHostTreeView,
    private iconService: IIconService,
  ) { }

  async createFoldNode(item: TreeViewItem): Promise<CompositeTreeViewNode> {
    const expanded = TreeItemCollapsibleState.Expanded === item.collapsibleState;
    const icon = await this.toIconClass(item);
    return {
      id: item.id,
      parent: undefined,
      name: item.label,
      label: item.label,
      icon,
      description: item.tooltip,
      visible: true,
      selected: false,
      expanded,
      children: [],
      command: item.command,
      contextValue: item.contextValue,
      depth: 0,
    };
  }

  async createNormalNode(item: TreeViewItem): Promise<TreeViewNode> {
    const icon = await this.toIconClass(item);
    return {
      id: item.id,
      name: item.label,
      label: item.label,
      icon,
      description: item.tooltip,
      parent: undefined,
      visible: true,
      selected: false,
      contextValue: item.contextValue,
      command: item.command,
      depth: 0,
    };
  }

  async toIconClass(item: TreeViewItem): Promise<string | undefined> {
    if (item.iconUrl || item.icon) {
      return this.iconService.fromIcon('', item.iconUrl || item.icon, IconType.Background);
    } else {
      return '';
    }
  }

  /**
   * 创建节点
   *
   * @param item tree view item from the ext
   */
  async createTreeNode(item: TreeViewItem): Promise<TreeNode> {
    if (item.collapsibleState !== TreeItemCollapsibleState.None) {
      return await this.createFoldNode(item);
    }
    return await this.createNormalNode(item);
  }

  async resolveChildren(itemId?: string): Promise<TreeNode[]> {
    const nodes: TreeNode[] = [];
    const children = await this.proxy.$getChildren(this.treeViewId, itemId);
    if (children && Array.isArray(children)) {
      for (const child of children) {
        const node = await this.createTreeNode(child);
        nodes.push(node);
      }
    }
    return nodes;
  }

  async refresh(itemsToRefresh?: TreeViewItem) {
    await this.onTreeDataChangedEmitter.fire(itemsToRefresh);
  }

  async reveal(viewItemId?: any) {
    await this.onRevealEventEmitter.fire(viewItemId);
  }

  async setSelection(treeViewId: string, id: string[]) {
    this.proxy.$setSelection(treeViewId, id);
  }

  async setExpanded(treeViewId: string, id: any, expanded: boolean) {
    this.proxy.$setExpanded(treeViewId, id, expanded);
  }

  async setVisible(treeViewId: string, visible: boolean) {
    this.proxy.$setVisible(treeViewId, visible);
  }
}
